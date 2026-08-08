import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Brain, Volume2, VolumeX } from 'lucide-react';
import './Login.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isMuted, setIsMuted] = useState(true);
    const videoRef = useRef(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;

        const nextMuted = !isMuted;
        video.muted = nextMuted;
        setIsMuted(nextMuted);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const result = await login(email, password);
        if (result.success) {
            navigate('/');
        } else {
            setError(result.message || 'Login failed. Please check your email and password, and make sure the backend server is running.');
        }
    };

    return (
        <div className="login-container">
            <video
                ref={videoRef}
                className="login-video-bg"
                autoPlay
                loop
                muted
                playsInline
            >
                <source src="/video_login.mp4" type="video/mp4" />
            </video>
            <div className="login-overlay" />

            <button
                type="button"
                className="login-video-mute-btn"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute background video' : 'Mute background video'}
                title={isMuted ? 'Unmute video' : 'Mute video'}
            >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <div className="login-content">
                <div className="login-header">
                    <div className="logo-wrapper">
                        <div className="logo-icon-bg">
                            <Brain size={32} color="white" />
                        </div>
                        <h1>ClassMind.ai</h1>
                    </div>
                    <p className="app-subtitle">AI-Powered Learning Management System</p>
                </div>

                <div className="login-card">
                    <h2>Welcome Back</h2>
                    <p className="card-subtitle">Sign in to continue</p>

                    {error && <div className="login-error">{error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Email Address</label>
                            <div className="input-wrapper">
                                <Mail className="input-icon" size={20} />

                                <input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Password</label>
                            <div className="input-wrapper">
                                <Lock className="input-icon" size={20} />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button type="submit" className="login-btn">Sign In</button>
                    </form>

                    <div className="login-footer-line"></div>
                </div>
            </div>
        </div>
    );
};

export default Login;
