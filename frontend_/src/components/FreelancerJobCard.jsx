import React, { useState } from 'react';
import { useWeb3Context } from '../contexts/Web3Context';
import JobContract from '../contracts/JobContract';

function FreelancerJobCard({ job }) {
  const { account } = useWeb3Context();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleWorkDone = async () => {
    if (!window.confirm('Are you sure you want to mark this job as completed?')) {
      return;
    }
    
    setSubmitting(true);
    setError(null);
    try {
      const jobContract = new JobContract(job.contractAddress);
      
      // Call the markWorkAsComplete function in the smart contract
      const tx = await jobContract.markWorkAsComplete(job.id, { from: account });
      
      // Wait for transaction confirmation
      await tx.wait();
      
      // Show success message
      setSuccess(true);
      
      // You could also emit an event to a notification service here
      
    } catch (err) {
      console.error("Error marking work as complete:", err);
      setError("Failed to submit work completion. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="job-card">
      <div className={`job-status-indicator ${job.status.toLowerCase()}`}></div>
      <h3 className="job-title">{job.title}</h3>
      <div className="job-details">
        <p>Status: {job.status} | Budget: {job.budget} ETH</p>
        <p className="employer-address">Employer: {job.employer}</p>
        
        {job.status === "ASSIGNED" && (
          <button 
            className="work-done-button"
            onClick={handleWorkDone}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Mark Work Done"}
          </button>
        )}
        
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">Work marked as complete! Waiting for employer to release payment.</p>}
      </div>
    </div>
  );
}

export default FreelancerJobCard;