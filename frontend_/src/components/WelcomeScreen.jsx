  // src/components/WelcomeScreen.jsx
  import React from 'react';
  import { useNavigate } from 'react-router-dom';
  import { useWeb3Context } from '../contexts/Web3Context';

  function WelcomeScreen() {
    const { connectWallet, setUserRole, isLoading, error, setError } = useWeb3Context();
    const navigate = useNavigate();
    
    const handleRoleSelect = async (role) => {
      setUserRole(role);
      try {
        await connectWallet();
        // On successful connection, navigate to appropriate dashboard
        navigate(role === 'employer' ? '/dashboard/employer' : '/dashboard/freelancer');
      } catch (err) {
        // Error handling is done in the context
        console.error("Connection failed:", err);
      }
    };
    
    return (
      <div className="welcome-screen">
        <div className="welcome-container">
          <h1>Welcome to DApp Jobs</h1>
          <p className="welcome-text">Connect your wallet to continue as:</p>
          
          <div className="role-selection">
            <button 
              className="role-button employer"
              onClick={() => handleRoleSelect('employer')}
              disabled={isLoading}
            >
              <div className="role-icon">💼</div>
              <span>Employer</span>
              <p className="role-description">Post jobs and hire talented freelancers</p>
            </button>
            
            <button 
              className="role-button freelancer"
              onClick={() => handleRoleSelect('freelancer')}
              disabled={isLoading}
            >
              <div className="role-icon">👩‍💻</div>
              <span>Freelancer</span>
              <p className="role-description">Find projects and apply for jobs</p>
            </button>
          </div>
          
          {isLoading && (
            <div className="loading-indicator">
              <div className="loading-spinner"></div>
              <p>Connecting to your wallet...</p>
            </div>
          )}
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={() => setError('')} className="dismiss-error">Dismiss</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  export default WelcomeScreen;