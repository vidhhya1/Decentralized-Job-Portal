// src/components/Navigation.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWeb3Context } from '../contexts/Web3Context';

function Navigation() {
  const { account, disconnectWallet, userRole } = useWeb3Context();
  const location = useLocation();

  // Active link checker
  const isActive = (path) => {
    // Check if the current path exactly matches or starts with the given path
    // This helps keep the dashboard link active even if nested routes are visited
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path)) ? 'active' : '';
  };

  return (
    <nav className="app-navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <Link to="/">
            <span className="brand-text">DApp Jobs</span>
          </Link>
        </div>

        <div className="nav-links">
          <ul>
            {/* Conditionally render the "Jobs" link */}
            {/* Show "Jobs" link if user is NOT an employer */}
            {userRole !== 'employer' && ( // <--- CHANGE: Added this condition
              <li className={isActive('/jobs')}>
                <Link to="/">Jobs</Link>
              </li>
            )}

            {/* Role-specific navigation items */}
            {userRole === 'employer' ? (
              // Employer only sees Dashboard
              <li className={isActive('/dashboard/employer')}> {/* <-- Updated path for isActive check */}
                <Link to="/dashboard/employer">Dashboard</Link>
              </li>
            ) : userRole === 'freelancer' ? (
              // Freelancer sees Dashboard (Jobs link is handled above)
              <li className={isActive('/dashboard/freelancer')}> {/* <-- Updated path for isActive check */}
                <Link to="/dashboard/freelancer">Dashboard</Link>
              </li>
            ) : (
              // When no role is selected yet, show Employer and Freelancer links
              // (Jobs link is already handled above)
              <>
                <li className={isActive('/employer')}>
                  <Link to="/employer">Employer</Link>
                </li>
                <li className={isActive('/freelancer')}>
                  <Link to="/freelancer">Freelancer</Link>
                </li>
              </>
            )}
          </ul>
        </div>

        <div className="nav-account">
          {account && (
            <>
              <div className="account-badge">
                {account.slice(0, 5)}...{account.slice(-4)}
              </div>
              <button className="disconnect-button" onClick={disconnectWallet}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navigation;