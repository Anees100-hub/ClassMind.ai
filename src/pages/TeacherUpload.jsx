import React, { useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { Upload, Brain, ArrowLeft, CheckCircle, FileText, BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import './TeacherUpload.css';

const TeacherUpload = () => {
    const navigate = useNavigate();
    const { courseId } = useParams();
    const { currentUser } = useAuth();
    const { teachers, refreshData, getTeacherCourse } = useData();

    const course = getTeacherCourse(currentUser?.email, courseId);
    const teacherObj = teachers.find(t => t.email === currentUser?.email);
    const teacherId = teacherObj?.id;

    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleFileSelect = (selectedFile) => {
        if (!selectedFile) return;
        setFile(selectedFile);
        if (!title) {
            setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
        }
        setErrorMsg('');
    };

    const handleFileChange = (e) => {
        handleFileSelect(e.target.files?.[0]);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files?.[0]);
    };

    const handleUpload = async () => {
        if (!file || !title) {
            setErrorMsg('Please provide a title and select a file.');
            return;
        }
        if (!teacherId) {
            setErrorMsg('Teacher profile not found. Please contact your administrator.');
            return;
        }

        setIsUploading(true);
        setErrorMsg('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', title);
            formData.append('description', description);
            formData.append('classId', course.id);
            formData.append('teacherId', String(teacherId));

            const res = await fetch('/api/materials/upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                await refreshData();
                setSuccess(true);
                setTimeout(() => navigate(`/teacher/course/${course.id}`), 2000);
            } else {
                const data = await res.json();
                setErrorMsg(data.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload Error:', error);
            setErrorMsg('Network error occurred during upload.');
        } finally {
            setIsUploading(false);
        }
    };

    if (!course) {
        return (
            <div className="teacher-upload-page teacher-page">
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
            className="teacher-upload-page"
        >
            <div className="breadcrumb">
                <button onClick={() => navigate(`/teacher/course/${course.id}`)} className="btn-back">
                    <ArrowLeft size={20} />
                    <span>Back to {course.id}</span>
                </button>
            </div>

            <div className="page-header">
                <div>
                    <h1>Upload Learning Material</h1>
                    <p>Upload lecture slides and let AI generate summaries automatically</p>
                </div>
            </div>

            <div className="upload-container-card">
                <div className="upload-header">
                    <div className="upload-icon-main">
                        <Upload size={32} color="white" />
                    </div>
                    <h2>Upload Course Material</h2>
                    <p>Supported formats: PDF, PPT, PPTX — max 50 MB</p>
                </div>

                {success ? (
                    <div className="upload-success">
                        <CheckCircle size={48} color="#10B981" />
                        <h3>Upload Successful!</h3>
                        <p>AI summary generated. Redirecting to course...</p>
                    </div>
                ) : (
                    <>
                        <div className="upload-form-group">
                            <label>Lecture Title *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter lecture title"
                                className="upload-input"
                            />
                        </div>

                        <div className="upload-form-group">
                            <label>Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief description for students..."
                                rows={3}
                                className="upload-textarea"
                            />
                        </div>

                        <div
                            className={`dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                        >
                            <input
                                type="file"
                                accept=".pdf,.ppt,.pptx"
                                onChange={handleFileChange}
                                className="dropzone-input"
                            />
                            {file ? (
                                <>
                                    <FileText size={48} color="#10B981" />
                                    <p className="drop-text selected">{file.name}</p>
                                    <p className="max-size">{(file.size / 1024 / 1024).toFixed(2)} MB — click to change</p>
                                </>
                            ) : (
                                <>
                                    <Upload size={48} color="#9CA3AF" />
                                    <p className="drop-text">Drag & drop your file here, or click to browse</p>
                                    <p className="max-size">Maximum file size: 50 MB</p>
                                </>
                            )}
                        </div>

                        {errorMsg && <p className="upload-error">{errorMsg}</p>}

                        <div className="ai-notice">
                            <div className="notice-icon">
                                <Brain size={20} color="#3B82F6" />
                            </div>
                            <div>
                                <h4>AI-Powered Summarization</h4>
                                <p>Once uploaded, our AI will automatically generate a concise summary of your lecture slides for students to review.</p>
                            </div>
                        </div>

                        <div className="upload-actions">
                            <button className="btn-cancel" onClick={() => navigate(-1)} disabled={isUploading}>Cancel</button>
                            <button className="btn-primary-large" onClick={handleUpload} disabled={isUploading || !file || !title}>
                                {isUploading ? 'Uploading & Analyzing...' : 'Start Upload'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Motion.div>
    );
};

export default TeacherUpload;
