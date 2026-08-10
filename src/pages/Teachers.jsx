import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '../context/DataContext';
import { apiFetch } from '../utils/api';
import * as XLSX from 'xlsx';
import { Plus, Search, Mail, Phone, Edit, Trash2, X, GraduationCap, MapPin, Calendar, BookOpen, FileSpreadsheet, Camera } from 'lucide-react';
import './Teachers.css';

const Teachers = () => {
    const { teachers, addTeacher, updateTeacher, deleteTeacher, classes, assignClassToTeacher, students, bulkAddTeachers } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [detailTeacher, setDetailTeacher] = useState(null);
    const [editingTeacher, setEditingTeacher] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '', lastName: '', email: '', phone: '', department: '', specialization: '', office: 'Campus Building 4, Office 201', status: 'Active', faceDescriptor: null
    });
    const [assignmentClassId, setAssignmentClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = React.useRef(null);

    // Face Recognition States
    const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
    const [webcamStream, setWebcamStream] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [faceCaptured, setFaceCaptured] = useState(false);
    const [simPose, setSimPose] = useState('Normal');
    const [faceUploadStatus, setFaceUploadStatus] = useState(null); // null | 'uploading' | 'success' | 'error'
    const [faceUploadMessage, setFaceUploadMessage] = useState('');
    const [pythonOnline, setPythonOnline] = useState(null); // null=checking, true=online, false=offline
    const [isRetraining, setIsRetraining] = useState(false);
    const [pendingFaceBlob, setPendingFaceBlob] = useState(null); // stored for new teachers until ID is assigned
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const photoFileInputRef = React.useRef(null);

    // Attendance History State for Selected Teacher (Admin View)
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Check Python server on mount + when face modal opens
    const checkPythonServer = async () => {
        try {
            const pingRes = await fetch('/python-api/face/ping', { signal: AbortSignal.timeout(8000) });
            if (!pingRes.ok) throw new Error('offline');
            setPythonOnline(true);
        } catch {
            setPythonOnline(false);
        }
    };

    useEffect(() => {
        checkPythonServer();
    }, []);

    useEffect(() => {
        if (detailTeacher) {
            setLoadingHistory(true);
            fetch(`/api/attendance/history?teacherId=${detailTeacher.id}`)
                .then(r => r.ok ? r.json() : [])
                .then(data => {
                    setAttendanceHistory(data);
                    setLoadingHistory(false);
                })
                .catch(err => {
                    console.error("Error fetching teacher logs:", err);
                    setAttendanceHistory([]);
                    setLoadingHistory(false);
                });
        } else {
            setAttendanceHistory([]);
        }
    }, [detailTeacher]);

    const openFaceRegistration = async () => {
        setIsFaceModalOpen(true);
        setFaceCaptured(false);
        setFaceUploadStatus(null);
        setFaceUploadMessage('');
        checkPythonServer(); // Re-check server status when modal opens
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300 } });
            setWebcamStream(stream);
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 300);
        } catch (error) {
            console.error("Failed to access camera:", error);
            alert("Camera Failure: System displays camera error. Attendance cannot be processed.");
        }
    };

    const closeFaceRegistration = () => {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
        }
        setWebcamStream(null);
        setIsFaceModalOpen(false);
        setFaceCaptured(false);
        setFaceUploadStatus(null);
        setFaceUploadMessage('');
    };

    // ── Core helper: capture current video frame as a JPEG Blob ──────────────
    const captureFrameAsBlob = () => {
        return new Promise((resolve, reject) => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) return reject(new Error('No video/canvas'));
            canvas.width = video.videoWidth || 400;
            canvas.height = video.videoHeight || 300;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', 0.92);
        });
    };

    // ── Upload photo blob/file to Python API and register face ───────────────
    const uploadFaceToPython = async (fileBlob, teacherIdNum) => {
        setFaceUploadStatus('uploading');
        setFaceUploadMessage('Uploading photo to Python face recognition server...');

        const teacherId = String(teacherIdNum);
        const formData = new FormData();
        formData.append('teacher_id', teacherId);
        formData.append('file', fileBlob, `teacher_${teacherId}_capture.jpg`);

        try {
            // Step 1: Upload photo to dataset folder
            const uploadRes = await fetch('/python-api/face/upload-photo', {
                method: 'POST',
                body: formData,
            });
            const uploadData = await uploadRes.json();

            if (!uploadRes.ok) {
                throw new Error(uploadData.detail || 'Photo upload failed');
            }
            setFaceUploadMessage(`✅ Photo saved (${uploadData.faces_detected} face detected). Registering descriptor...`);

            // Step 2: Register 128D face descriptor to MongoDB
            const regFormData = new FormData();
            regFormData.append('teacher_id', teacherId);
            regFormData.append('file', fileBlob, `teacher_${teacherId}_capture.jpg`);

            const regRes = await fetch('/python-api/face/register-to-db', {
                method: 'POST',
                body: regFormData,
                signal: AbortSignal.timeout(180000),
            });
            const regData = await regRes.json().catch(() => ({}));

            if (!regRes.ok) {
                const detail = regData.detail;
                throw new Error(typeof detail === 'string' ? detail : (detail?.[0]?.msg || 'Face descriptor registration failed'));
            }

            // Step 3: Persist via Node (auth required) — works even if Python Mongo is down
            if (!regData.descriptor || !Array.isArray(regData.descriptor)) {
                throw new Error('Python server did not return a valid face descriptor.');
            }
            const nodeRes = await apiFetch('/api/teachers/register-face', {
                method: 'POST',
                body: JSON.stringify({
                    teacherId: teacherIdNum,
                    faceDescriptor: regData.descriptor
                })
            });
            if (!nodeRes.ok) {
                const nodeErr = await nodeRes.json().catch(() => ({}));
                throw new Error(nodeErr.message || 'Failed to save face via Node API. Log in again and retry.');
            }

            // Step 4: Retrain encodings so recognition model includes this teacher
            await fetch('/python-api/face/train?sync=true', { method: 'POST', signal: AbortSignal.timeout(180000) });

            setFaceUploadStatus('success');
            setFaceUploadMessage(`Face registered! ${regData.descriptor_dimensions || regData.descriptor.length}D descriptor saved. Model retrained.`);
            setFormData(prev => ({ ...prev, faceDescriptor: regData.descriptor }));
            setFaceCaptured(true);

        } catch (err) {
            console.error('Python face registration error:', err);
            setFaceUploadStatus('error');
            setFaceUploadMessage(`❌ Python server error: ${err.message}`);
        }
    };

    const handleCaptureFace = async () => {
        setIsCapturing(true);
        setFaceUploadStatus(null);
        setFaceUploadMessage('');

        // Simulation validation modes
        if (simPose === 'SideFace') {
            setIsCapturing(false);
            alert('Biometric Validation Failed: Side face detected. Please ensure you are looking straight into the camera.');
            return;
        }
        if (simPose === 'HalfFace') {
            setIsCapturing(false);
            alert('Biometric Validation Failed: Partial face/half face detected. Ensure your full face is visible inside the frame.');
            return;
        }
        if (simPose === 'LowLighting') {
            setIsCapturing(false);
            alert('Biometric Validation Failed: Poor illumination / low lighting. Please move to a brighter environment.');
            return;
        }
        if (simPose === 'TooFar') {
            setIsCapturing(false);
            alert('Biometric Validation Failed: Face is too far or offset from center. Move closer and align inside the circular guide.');
            return;
        }

        // Give a brief scanning delay for UX
        await new Promise(r => setTimeout(r, 800));
        setIsCapturing(false);

        const teacherIdNum = isEditing && editingTeacher?.id ? editingTeacher.id : null;

        if (pythonOnline && teacherIdNum !== null) {
            try {
                const blob = await captureFrameAsBlob();
                await uploadFaceToPython(blob, teacherIdNum);
            } catch (err) {
                console.error('Capture error:', err);
                setFaceCaptured(false);
                setFaceUploadStatus('error');
                setFaceUploadMessage(`❌ ${err.message || 'Face capture failed. Ensure your face is clearly visible.'}`);
            }
        } else if (pythonOnline && teacherIdNum === null) {
            try {
                const blob = await captureFrameAsBlob();
                setPendingFaceBlob(blob);
                setFaceCaptured(true);
                setFaceUploadStatus('success');
                setFaceUploadMessage('📸 Face captured! Will be registered automatically when you save the teacher.');
            } catch (err) {
                console.error('Capture error for new teacher:', err);
                setFaceCaptured(false);
                setFaceUploadStatus('error');
                setFaceUploadMessage('❌ Failed to capture face. Please try again.');
            }
        } else {
            setFaceCaptured(false);
            setFaceUploadStatus('error');
            setFaceUploadMessage('❌ Python server is offline. Start the FastAPI server to register faces.');
        }
    };

    // ── Upload photo from file input ─────────────────────────────────────────
    const handlePhotoFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        const teacherIdNum = isEditing && editingTeacher?.id ? editingTeacher.id : null;

        if (pythonOnline && teacherIdNum !== null) {
            // Existing teacher: register immediately
            await uploadFaceToPython(file, teacherIdNum);
        } else if (pythonOnline && teacherIdNum === null) {
            setPendingFaceBlob(file);
            setFaceCaptured(true);
            setFaceUploadStatus('success');
            setFaceUploadMessage('📂 Photo ready! Will be registered automatically when you save the teacher.');
        } else {
            setFaceUploadStatus('error');
            setFaceUploadMessage('❌ Python server is offline. Cannot upload photo. Start FastAPI server first.');
        }
    };

    // ── Trigger model retraining via Python API ───────────────────────────────
    const handleRetrain = async () => {
        if (!pythonOnline) {
            alert('Python server is offline. Cannot retrain. Start FastAPI server first.');
            return;
        }
        setIsRetraining(true);
        try {
            const res = await fetch('/python-api/face/train', { method: 'POST' });
            const data = await res.json();
            alert(`✅ Retraining started in background!\n${data.message || ''}\nCheck Python server console for progress.`);
        } catch (err) {
            alert('Failed to trigger retraining. Check if Python server is running.');
        } finally {
            setIsRetraining(false);
        }
    };

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
                        if (confirm(`Found ${data.length} teachers in Excel. Start import?`)) {
                            const results = await bulkAddTeachers(data);
                            if (results) {
                                alert(`Successfully imported ${results.success} teachers! Failures: ${results.failed}`);
                            }
                        }
                    } else {
                        alert("No data found in the Excel file.");
                    }
                } catch (error) {
                    console.error("Excel processing error:", error);
                    alert("Error processing Excel file. Please ensure it is a valid .xlsx or .csv file.");
                }
            };
            reader.readAsBinaryString(file);
        }
    };

    const filteredTeachers = teachers.filter(teacher =>
        `${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (isEditing && editingTeacher) {
                if (!editingTeacher.id) {
                    alert("Error: Teacher ID is missing. Cannot update.");
                    setIsSaving(false);
                    return;
                }
                const success = await updateTeacher(editingTeacher.id, formData);
                if (success) {
                    // Update detail view if consistent
                    if (detailTeacher?.id === editingTeacher.id) {
                        setDetailTeacher({ ...detailTeacher, ...formData });
                    }
                    closeModal();
                } else {
                    alert("Failed to update teacher. Please check the console/server logs.");
                }
            } else {
                const newTeacher = await addTeacher(formData);
                if (newTeacher) {
                    // If a face photo was captured before ID was assigned, register it now
                    if (pendingFaceBlob && pythonOnline && newTeacher.id) {
                        try {
                            await uploadFaceToPython(pendingFaceBlob, newTeacher.id);
                        } catch (err) {
                            console.warn('Auto face registration after save failed:', err);
                        }
                    }
                    setPendingFaceBlob(null);
                    closeModal();
                } else {
                    alert("Failed to add teacher. Please try again or check logs.");
                }
            }
        } catch (error) {
            console.error("Submit failed", error);
            alert("Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const openAddModal = () => {
        setIsEditing(false);
        setEditingTeacher(null);
        setFormData({ firstName: '', lastName: '', email: '', phone: '', department: '', specialization: '', office: 'Campus Building 4, Office 201', status: 'Active', faceDescriptor: null });
        setIsModalOpen(true);
    };

    const openEditModal = (teacher) => {
        setIsEditing(true);
        setEditingTeacher(teacher);
        setFormData({
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.email,
            phone: teacher.phone,
            department: teacher.department,
            specialization: teacher.specialization || '',
            office: teacher.office || 'Campus Building 4, Office 201',
            status: teacher.status || 'Active',
            faceDescriptor: teacher.faceDescriptor || null
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setIsEditing(false);
        setEditingTeacher(null);
        setPendingFaceBlob(null);
        setFormData({ firstName: '', lastName: '', email: '', phone: '', department: '', specialization: '', office: 'Campus Building 4, Office 201', status: 'Active', faceDescriptor: null });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this teacher? Their login account will be permanently removed and they will no longer be able to sign in.')) {
            const result = await deleteTeacher(id);
            if (result?.success) {
                if (detailTeacher?.id === id) setDetailTeacher(null);
            } else {
                alert(result?.message || 'Failed to delete teacher. Please try again.');
            }
        }
    };

    const handleAssignClass = () => {
        if (detailTeacher && assignmentClassId) {
            assignClassToTeacher(detailTeacher.id, assignmentClassId);
            setAssignmentClassId('');
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
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
                    <h1>Teacher Management</h1>
                    <p>Manage and monitor teaching staff</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
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
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="btn-primary"
                        onClick={openAddModal}
                    >
                        <Plus size={20} />
                        Add New Teacher
                    </motion.button>
                </div>
            </div>

            <motion.div variants={itemVariants} className="filters-bar">
                <div className="search-wrapper">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search teachers by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </motion.div>

            <motion.div variants={itemVariants} className="stats-row">
                <div className="summary-card">
                    <span className="label">Total Teachers</span>
                    <span className="value">{filteredTeachers.length}</span>
                </div>
                <div className="summary-card">
                    <span className="label">Active</span>
                    <span className="value text-green">{filteredTeachers.filter(t => t.status === 'Active').length}</span>
                </div>
                <div className="summary-card">
                    <span className="label">Avg. Classes</span>
                    <span className="value">{(filteredTeachers.reduce((acc, t) => acc + (t.assignedClasses?.length || 0), 0) / (filteredTeachers.length || 1)).toFixed(1)}</span>
                </div>
                <div className="summary-card">
                    <span className="label">Classes Assigned</span>
                    <span className="value text-blue">{filteredTeachers.reduce((acc, t) => acc + (t.assignedClasses?.length || 0), 0)}</span>
                </div>
            </motion.div>

            <motion.div variants={itemVariants} className="table-container shadow-hover table-scroll-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Teacher</th>
                            <th>Contact</th>
                            <th>Classes</th>
                            <th>Students</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTeachers.length > 0 ? (
                            filteredTeachers.map(teacher => (
                                <motion.tr
                                    key={teacher.id}
                                    whileHover={{ backgroundColor: '#F9FAFB' }}
                                    onClick={() => setDetailTeacher(teacher)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>
                                        <div className="user-cell">
                                            <div className="avatar-circle">{teacher.firstName[0]}</div>
                                            <div>
                                                <p className="cell-title">{teacher.firstName} {teacher.lastName}</p>
                                                <p className="cell-subtitle">{teacher.department}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="contact-cell">
                                            <p><Mail size={14} /> {teacher.email}</p>
                                            <p><Phone size={14} /> {teacher.phone}</p>
                                        </div>
                                    </td>
                                    <td>{teacher.assignedClasses?.length || 0}</td>
                                    <td>
                                        {classes
                                            .filter(c => teacher.assignedClasses?.includes(c.id))
                                            .reduce((acc, c) => {
                                                const enrolledCount = students.filter(s => s.enrolledClasses && s.enrolledClasses.includes(c.id)).length;
                                                return acc + enrolledCount;
                                            }, 0)}
                                    </td>
                                    <td><span className={`status-pill ${(teacher.status || 'Active').toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{teacher.status || 'Active'}</span></td>
                                    <td>
                                        <div className="actions-cell">
                                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEditModal(teacher); }}><Edit size={18} /></button>
                                            <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(teacher.id); }}><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <Search size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
                                    <p>No teachers found matching your search.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </motion.div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="modal-overlay modal-overlay-center">
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 20 }}
                            className="premium-form-modal teacher-form-modal"
                        >
                            <div className="premium-form-modal-header">
                                <div className="premium-form-modal-title">
                                    <div className="premium-form-icon teacher">
                                        <GraduationCap size={28} />
                                    </div>
                                    <div>
                                        <h2>{isEditing ? 'Edit Teacher Profile' : 'Add New Teacher'}</h2>
                                        <p>{isEditing ? 'Update faculty information and status' : 'Register a new faculty member to ClassMind.ai'}</p>
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
                                            <input name="firstName" value={formData.firstName} onChange={handleInputChange} required placeholder="Sarah" />
                                        </div>
                                        <div className="form-group">
                                            <label>Last Name</label>
                                            <input name="lastName" value={formData.lastName} onChange={handleInputChange} required placeholder="Johnson" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Email Address</label>
                                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="teacher@classmind.ai" />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone Number</label>
                                        <input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+1 234-567-8900" />
                                    </div>
                                </div>

                                <div className="form-section-card">
                                    <h3 className="form-section-title">Professional Details</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Department</label>
                                            <input name="department" value={formData.department} onChange={handleInputChange} required placeholder="Computer Science" />
                                        </div>
                                        <div className="form-group">
                                            <label>Specialization</label>
                                            <input name="specialization" value={formData.specialization} onChange={handleInputChange} required placeholder="AI & Machine Learning" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Office Location</label>
                                        <input name="office" value={formData.office} onChange={handleInputChange} required placeholder="Campus Building 4, Office 201" />
                                    </div>
                                    <div className="form-group">
                                        <label>Employment Status</label>
                                        <select name="status" value={formData.status} onChange={handleInputChange} className="premium-select">
                                            <option value="Active">Active</option>
                                            <option value="On Leave">On Leave</option>
                                            <option value="Inactive">Inactive</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-section-card face-section">
                                    <div className="face-section-header">
                                        <div>
                                            <h3 className="form-section-title" style={{ marginBottom: '4px' }}>Face Recognition</h3>
                                            <p className="form-section-hint">Optional — enables attendance scanner for this teacher</p>
                                        </div>
                                        {formData.faceDescriptor ? (
                                            <span className="face-status-badge success">Registered</span>
                                        ) : (
                                            <span className="face-status-badge pending">Not Registered</span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-face-register"
                                        onClick={openFaceRegistration}
                                    >
                                        <Camera size={18} />
                                        {formData.faceDescriptor ? 'Re-register Face' : 'Register Face via Webcam'}
                                    </button>
                                </div>

                                <div className="modal-footer premium-footer">
                                    <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSaving}>Cancel</button>
                                    <button type="submit" className="btn-primary" disabled={isSaving}>
                                        {isSaving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Teacher')}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}

                {detailTeacher && !isModalOpen && (
                    <div className="modal-overlay" onClick={() => setDetailTeacher(null)}>
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="detail-panel"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="detail-panel-header">
                                <button onClick={() => setDetailTeacher(null)} className="close-btn-round"><X size={20} /></button>
                                <div className="detail-hero">
                                    <div className="detail-avatar">{detailTeacher.firstName[0]}</div>
                                    <div className="detail-name-block">
                                        <h3>{detailTeacher.firstName} {detailTeacher.lastName}</h3>
                                        <p>{detailTeacher.department}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-body">
                                <div className="detail-section">
                                    <h4>Contact Information</h4>
                                    <div className="detail-info-item">
                                        <Mail size={18} />
                                        <span>{detailTeacher.email}</span>
                                    </div>
                                    <div className="detail-info-item">
                                        <Phone size={18} />
                                        <span>{detailTeacher.phone}</span>
                                    </div>
                                    <div className="detail-info-item">
                                        <MapPin size={18} />
                                        <span>{detailTeacher.office || 'Campus Building 4, Office 201'}</span>
                                    </div>
                                </div>

                                <div className="detail-section">
                                    <h4>Teaching Profile</h4>
                                    <div className="stats-mini-grid">
                                        <div className="mini-stat">
                                            <BookOpen size={20} color="#3B82F6" />
                                            <div>
                                                <p className="mini-value">{detailTeacher.assignedClasses?.length || 0}</p>
                                                <p className="mini-label">Classes</p>
                                            </div>
                                        </div>
                                        <div className="mini-stat">
                                            <GraduationCap size={20} color="#A855F7" />
                                            <div>
                                                <p className="mini-value">
                                                    {classes
                                                        .filter(c => detailTeacher.assignedClasses?.includes(c.id))
                                                        .reduce((acc, c) => {
                                                            const enrolledCount = students.filter(s => s.enrolledClasses && s.enrolledClasses.includes(c.id)).length;
                                                            return acc + enrolledCount;
                                                        }, 0)}
                                                </p>
                                                <p className="mini-label">Students</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="detail-section">
                                    <h4>Assigned Schedule</h4>
                                    {classes.filter(c => detailTeacher.assignedClasses?.includes(c.id)).length > 0 ? (
                                        classes.filter(c => detailTeacher.assignedClasses?.includes(c.id)).map(course => (
                                            <div key={course.id} className="schedule-item">
                                                <Calendar size={18} />
                                                <div>
                                                    <p className="schedule-title">{course.name}</p>
                                                    <p className="schedule-time">{course.schedule || 'Schedule TBD'}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No classes assigned yet.</p>
                                    )}
                                </div>
                            </div>

                            <div className="detail-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                                <h4>Face Recognition Attendance Logs</h4>
                                {loadingHistory ? (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading logs...</p>
                                ) : attendanceHistory.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {attendanceHistory.map((log) => (
                                            <div key={log._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                <div>
                                                    <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Class: {log.classId}</p>
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Session: {log.lectureId}</p>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-primary)', margin: 0 }}>{(log.confidence * 100).toFixed(0)}% Match</p>
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>{new Date(log.date).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No face recognition attendance recorded yet.</p>
                                )}
                            </div>

                            <div className="detail-footer">
                                <button className="btn-secondary" onClick={() => {/* Message functionality placeholder */ }}>Message Teacher</button>
                                <button className="btn-primary" onClick={() => openEditModal(detailTeacher)}>Edit Profile</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isFaceModalOpen && (
                    <div className="modal-overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="modal-content"
                            style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}
                        >
                            {/* Hidden canvas for frame capture */}
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                            {/* Hidden file input for photo upload */}
                            <input
                                type="file"
                                ref={photoFileInputRef}
                                onChange={handlePhotoFileUpload}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />

                            <div className="modal-header">
                                <h2>Register Teacher Face</h2>
                                <button type="button" onClick={closeFaceRegistration} className="close-btn"><X size={24} /></button>
                            </div>

                            {/* Python Server Status Badge */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px', padding: '8px 16px', borderRadius: '8px', background: pythonOnline === true ? '#ECFDF5' : pythonOnline === false ? '#FEF2F2' : '#FEF9C3', border: `1px solid ${pythonOnline === true ? '#A7F3D0' : pythonOnline === false ? '#FCA5A5' : '#FDE68A'}` }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: pythonOnline === true ? '#10B981' : pythonOnline === false ? '#EF4444' : '#F59E0B', animation: pythonOnline === null ? 'pulse 1.5s infinite' : 'none' }} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: pythonOnline === true ? '#065F46' : pythonOnline === false ? '#991B1B' : '#92400E' }}>
                                    {pythonOnline === true ? '🤖 Python AI Server: Online — Real face recognition' :
                                     pythonOnline === false ? '⚡ Python Server Offline — Face registration requires FastAPI server' :
                                     '⏳ Checking Python server...'}
                                </span>
                            </div>

                            <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Face Bio-Validation Simulator:</label>
                                <select
                                    value={simPose}
                                    onChange={(e) => setSimPose(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.9rem', width: '100%', background: '#FFF', outline: 'none' }}
                                >
                                    <option value="Normal">Normal (Clear Full Face, Straight looking)</option>
                                    <option value="SideFace">Side Face / Profile Angle (Fail Validation)</option>
                                    <option value="HalfFace">Half Face / Cropped (Fail Validation)</option>
                                    <option value="LowLighting">Low Lighting / Dark Frame (Fail Validation)</option>
                                    <option value="TooFar">Too Far / Center Drift (Fail Validation)</option>
                                </select>
                            </div>

                            <div style={{ margin: '20px 0', position: 'relative' }}>
                                {!faceCaptured ? (
                                    <div style={{ position: 'relative', width: '320px', height: '240px', margin: '0 auto', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />

                                        <div style={{
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            width: '160px',
                                            height: '160px',
                                            border: `3px dashed ${faceUploadStatus === 'uploading' ? '#F59E0B' : '#00C2FF'}`,
                                            borderRadius: '50%',
                                            pointerEvents: 'none',
                                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
                                        }} />

                                        {(isCapturing || faceUploadStatus === 'uploading') && (
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: '4px',
                                                background: `linear-gradient(to right, transparent, ${faceUploadStatus === 'uploading' ? '#F59E0B' : '#00C2FF'}, transparent)`,
                                                animation: 'scanLine 1.2s linear infinite',
                                                pointerEvents: 'none'
                                            }} />
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ width: '320px', height: '160px', margin: '0 auto', background: faceUploadStatus === 'success' ? '#D1FAE5' : faceUploadStatus === 'error' ? '#FEF2F2' : '#EFF6FF', border: `2px solid ${faceUploadStatus === 'success' ? '#10B981' : faceUploadStatus === 'error' ? '#FCA5A5' : '#93C5FD'}`, borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: faceUploadStatus === 'success' ? '#10B981' : faceUploadStatus === 'error' ? '#EF4444' : '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', flexShrink: 0 }}>
                                            {faceUploadStatus === 'success' ? (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            ) : faceUploadStatus === 'error' ? (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                            ) : (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            )}
                                        </div>
                                        <p style={{ fontWeight: 700, color: faceUploadStatus === 'success' ? '#065F46' : faceUploadStatus === 'error' ? '#991B1B' : '#1D4ED8', margin: 0, fontSize: '0.9rem' }}>
                                            {faceUploadStatus === 'success' ? 'Face Registered Successfully' : faceUploadStatus === 'error' ? 'Registration Issue' : 'Face Captured'}
                                        </p>
                                        <p style={{ fontSize: '0.75rem', color: faceUploadStatus === 'success' ? '#047857' : faceUploadStatus === 'error' ? '#B91C1C' : '#1D4ED8', margin: 0, lineHeight: 1.4 }}>
                                            {faceUploadMessage}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Upload status banner (when uploading) */}
                            {faceUploadStatus === 'uploading' && (
                                <p style={{ color: '#B45309', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px', background: '#FEF9C3', padding: '8px 12px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                    ⏳ {faceUploadMessage}
                                </p>
                            )}

                            {!faceCaptured && !faceUploadStatus && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                                    {isCapturing ? 'Scanning face...' : 'Align face inside the target area and capture. Or upload a photo file below.'}
                                </p>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                                {!faceCaptured ? (
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <button type="button" className="btn-secondary" onClick={closeFaceRegistration} disabled={isCapturing || faceUploadStatus === 'uploading'}>Cancel</button>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={handleCaptureFace}
                                            disabled={isCapturing || faceUploadStatus === 'uploading'}
                                            style={{ background: 'var(--gradient-primary)' }}
                                        >
                                            {isCapturing ? 'Scanning...' : faceUploadStatus === 'uploading' ? 'Registering...' : '📸 Capture Face'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => photoFileInputRef.current?.click()}
                                            disabled={isCapturing || faceUploadStatus === 'uploading'}
                                        >
                                            📂 Upload Photo
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <button type="button" className="btn-secondary" onClick={() => { setFaceCaptured(false); setFaceUploadStatus(null); setFaceUploadMessage(''); }}>Retake</button>
                                        <button type="button" className="btn-primary" onClick={closeFaceRegistration} style={{ background: 'var(--gradient-primary)' }}>✅ Confirm</button>
                                    </div>
                                )}

                                {/* Retrain Model Button — only after successful registration */}
                                {faceUploadStatus === 'success' && pythonOnline && (
                                    <button
                                        type="button"
                                        onClick={handleRetrain}
                                        disabled={isRetraining}
                                        style={{ background: '#7C3AED', color: '#FFF', border: 'none', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        {isRetraining ? '⏳ Retraining...' : '🔁 Retrain Recognition Model'}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                        <style>{`
                            @keyframes scanLine {
                                0% { top: 0%; }
                                50% { top: 100%; }
                                100% { top: 0%; }
                            }
                            @keyframes pulse {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.4; }
                            }
                        `}</style>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Teachers;

