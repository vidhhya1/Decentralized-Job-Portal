// src/App.jsx
import React, { useEffect, useState } from 'react';
import { Routes, Route, Outlet, useNavigate } from 'react-router-dom';
import { useWeb3Context } from './contexts/Web3Context';

// Import Components
import Navigation from './components/Navigation.jsx';
import ConnectWallet from './components/ConnectWallet.jsx';
import JobList from './components/JobList.jsx';
import JobDetail from './components/JobDetail.jsx';
import JobForm from './components/JobForm.jsx';
import EmployerDashboard from './components/EmployerDashboard.jsx';
import FreelancerDashboard from './components/FreelancerDashboard.jsx';

import './App.css';

// Layout Component (Only rendered when connected)
function MainLayout() {
    const { error, setError, userRole } = useWeb3Context();
    
    return (
        <div className="app-layout">
            <Navigation userRole={userRole} />
            <main className="main-content container">
                {error && (
                    <div className="alert alert-danger">
                        Error: {error}
                        <button onClick={() => setError('')} className="close-alert">&times;</button>
                    </div>
                )}
                <Outlet />
            </main>
            <footer className="app-footer">
                Decentralized Job Portal &copy; 2025
            </footer>
        </div>
    );
}

// Welcome View Component with Role Selection
function WelcomeView() {
    const { connectWallet, isLoading, error, setError, setUserRole } = useWeb3Context();
    const [selectedRole, setSelectedRole] = useState(null);
    
    const handleRoleSelect = async (role) => {
        setSelectedRole(role);
        setUserRole(role);
        await connectWallet();
    };
    
    return (
        <div className="welcome-view">
            <div className="welcome-container">
                <h1 className="welcome-title">Welcome to the Decentralized Job Portal</h1>
                <p className="welcome-subtitle">Connect your wallet to get started</p>
                
                <div className="role-selection">
                    <h2>I am a...</h2>
                    <div className="role-buttons">
                        <button 
                            className={`role-button employer ${selectedRole === 'employer' ? 'selected' : ''}`} 
                            onClick={() => handleRoleSelect('employer')}
                            disabled={isLoading}
                        >
                            <div className="role-icon">💼</div>
                            <span>Employer</span>
                        </button>
                        
                        <button 
                            className={`role-button freelancer ${selectedRole === 'freelancer' ? 'selected' : ''}`}
                            onClick={() => handleRoleSelect('freelancer')}
                            disabled={isLoading}
                        >
                            <div className="role-icon">👩‍💻</div>
                            <span>Freelancer</span>
                        </button>
                    </div>
                </div>
                
                {isLoading && (
                    <div className="connecting-wallet">
                        <div className="loading-spinner"></div>
                        <p>Connecting to wallet...</p>
                    </div>
                )}
                
                {error && (
                    <div className="alert alert-danger connect-error">
                        {error}
                        <button onClick={() => setError('')} className="close-alert">&times;</button>
                    </div>
                )}
                
                <div className="welcome-footer">
                    <p>Secure, transparent, and decentralized job marketplace</p>
                </div>
            </div>
        </div>
    );
}

// Welcome User Component (displayed right after connection)
function WelcomeUser() {
    const { account, userRole } = useWeb3Context();
    const navigate = useNavigate();
    
    useEffect(() => {
        // Redirect after 3 seconds
        const timer = setTimeout(() => {
            if (userRole === 'employer') {
                navigate('/dashboard/employer');
            } else {
                navigate('/dashboard/freelancer');
            }
        }, 3000);
        
        return () => clearTimeout(timer);
    }, [navigate, userRole]);
    
    return (
        <div className="welcome-user">
            <div className="welcome-user-container">
                <div className="welcome-avatar">
                    {userRole === 'employer' ? '💼' : '👩‍💻'}
                </div>
                <h1>Welcome, {userRole === 'employer' ? 'Employer' : 'Freelancer'}!</h1>
                <p className="account-display">Connected as: {account.slice(0, 6)}...{account.slice(-4)}</p>
                <div className="loader-bar"></div>
                <p className="redirect-message">Redirecting to your dashboard...</p>
            </div>
        </div>
    );
}

// Main App Component
function App() {
    const { account, isLoading: contextIsLoading, userRole } = useWeb3Context();
    const [isInitiallyLoading, setIsInitiallyLoading] = useState(true);

    useEffect(() => {
        // Simplified: Assume loading is done when context is no longer loading
        // OR immediately if an account is already present (e.g., page refresh while connected)
        if (!contextIsLoading || account) {
            setIsInitiallyLoading(false);
        }
    }, [contextIsLoading, account]);

    if (isInitiallyLoading) {
        return (
            <div className="loading-fullpage">
                <div className="loading-spinner"></div>
                <span>Initializing Application...</span>
            </div>
        );
    }

    return (
        <Routes>
            {!account ? (
                <Route path="*" element={<WelcomeView />} />
            ) : !userRole ? (
                <Route path="*" element={<WelcomeView />} />
            ) : (
                <>
                    <Route path="/welcome" element={<WelcomeUser />} />
                    <Route path="/" element={<MainLayout />}>
                        <Route index element={<JobList />} />
                        <Route path="job/:jobId" element={<JobDetail />} />
                        <Route path="dashboard/employer" element={<EmployerDashboard />} />
                        <Route path="post-job" element={<JobForm />} />
                        <Route path="dashboard/freelancer" element={<FreelancerDashboard />} />
                        <Route path="*" element={<NotFound />} />
                    </Route>
                </>
            )}
        </Routes>
    );
}

function NotFound() {
    return (
        <div className="not-found">
            <h2>404 - Page Not Found</h2>
            <p>The page you requested could not be found.</p>
        </div>
    );
}

export default App;