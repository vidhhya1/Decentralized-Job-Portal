// src/components/EmployerPage.jsx
import React from 'react';
import JobForm from './JobForm';
import EmployerDashboard from './EmployerDashboard';
import { useWeb3Context } from '../contexts/Web3Context';
import './EmployerPage.css'; // Import the CSS file

function EmployerPage() {
  const { account } = useWeb3Context();

  // Show a message if the wallet is not connected
  // This component likely won't render if App.jsx handles disconnection,
  // but it's safe to keep the check.
  if (!account) {
      return (
          <div className="page-message"> {/* Use className */}
              Please connect your wallet to access the Employer section.
          </div>
        );
  }

  return (
    // Use classNames for styling
    <div className="employer-page-wrapper">
      {/* Section 1: Post a New Job */}
      <div className="employer-page-section">
          {/* JobForm already has its own container/styling */}
          <JobForm />
      </div>


      {/* Section 2: View My Posted Jobs */}
      <hr className="section-divider" /> {/* Use className */}
      <div className="employer-page-section">
           {/* EmployerDashboard has its own container/styling */}
          <EmployerDashboard />
      </div>

    </div>
  );
}

export default EmployerPage;