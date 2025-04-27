// src/components/JobList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { formatEther, ZeroAddress } from 'ethers'; // Ethers v6 imports
import { Link } from 'react-router-dom'; // Ensure Link is imported
import { useWeb3Context } from '../contexts/Web3Context';
import './JobList.css'; // Import CSS

// --- Helper Function ---
const shortenAddress = (address) => {
    if (!address || typeof address !== 'string' || address === ZeroAddress) return 'None';
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// --- Status mapping (Matches contract where DISPUTED=4) ---
const JobStatus = { 0: 'OPEN', 1: 'ASSIGNED', 2: 'COMPLETED', 3: 'REFUNDED', 4: 'DISPUTED' };
const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase().replace('_', '');
    switch (statusLower) {
        case 'open': return '#2ecc71';
        case 'assigned': return '#f39c12';
        case 'completed': return '#9b59b6';
        case 'refunded': return '#e74c3c';
        case 'disputed': return '#dc3545';
        default: return '#bdc3c7';
    }
};
// --- End Status mapping ---

function JobList() {
    const { contract, account, provider, setError, signer } = useWeb3Context();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true); // Set initial loading true
    const [applyingJobId, setApplyingJobId] = useState(null);
    const [txStatus, setTxStatus] = useState({}); // Status per job ID

    // Helper to update temporary status messages per job
    const updateTxStatus = (jobId, status, message = '') => {
        setTxStatus(prev => ({ ...prev, [jobId]: { status, message } }));
        setTimeout(() => setTxStatus(prev => {
            const newState = { ...prev };
            // Only delete if status hasn't changed in the meantime
            if(newState[jobId]?.status === status && newState[jobId]?.message === message) {
                delete newState[jobId];
            }
            return newState;
        }), 6000); // Clear after 6 seconds
    };

    // Fetch all jobs (consider pagination for many jobs)
    const fetchJobs = useCallback(async () => {
        if (!contract || !provider) { setJobs([]); return; }
        // No need to setLoading(true) on interval fetches, only initial
        let isInitialFetch = jobs.length === 0; // Check if it's the first fetch

        try {
            const readContract = contract.connect(provider);
            const countBigInt = await readContract.getJobCount();
            const count = Number(countBigInt);
            const fetchedJobsPromises = [];

            for (let i = count; i >= 1; i--) {
                fetchedJobsPromises.push(
                     (async () => {
                         try {
                             const jobData = await readContract.getJob(i);
                             const escrowAmount = await readContract.getEscrowAmount(i);
                             const statusNumber = Number(jobData.status);

                             // Filter out jobs not suitable for public listing here if desired
                             // For now, returning all and filtering in render, but could optimize
                             if (jobData.employer !== ZeroAddress) { // Basic check for valid job
                                 return {
                                     id: Number(jobData.id),
                                     title: jobData.title,
                                     budget: formatEther(jobData.budget),
                                     employer: jobData.employer, // Keep full address internally
                                     status: JobStatus[statusNumber] || 'Unknown',
                                     isEscrowed: escrowAmount > 0n && escrowAmount === jobData.budget,
                                     rawStatus: statusNumber,
                                 };
                             }
                             return null;
                         } catch (jobError) {
                              console.warn(`Could not fetch job ID ${i}:`, jobError);
                              return null;
                         }
                     })()
                 );
            }
            const results = await Promise.all(fetchedJobsPromises);
            const fetchedJobs = results.filter(job => job !== null).sort((a, b) => b.id - a.id); // Sort newest first
            setJobs(fetchedJobs);

        } catch (err) {
            console.error("Fetch Jobs Error:", err);
            if (isInitialFetch) setError("Failed to fetch job listings."); // Set global error on initial fail
            setJobs([]); // Clear jobs on error
        } finally {
            // Only set loading false after the first successful fetch
            if (isInitialFetch) setLoading(false);
        }
    }, [contract, provider, setError, account]); // Added account dependency

    // Initial fetch and interval setup
    useEffect(() => {
        let intervalId = null;
        if (contract && provider) {
             setLoading(true); // Set loading true for the initial fetch
             fetchJobs(); // Initial fetch
             intervalId = setInterval(fetchJobs, 30000); // Poll every 30 seconds
         } else {
             setLoading(false); // Not ready to load
             setJobs([]);
         }
        return () => { if (intervalId) clearInterval(intervalId); }; // Cleanup interval
    }, [fetchJobs, contract, provider]); // Dependencies trigger fetch/interval setup

    // Handle Apply button click
    const handleApply = async (jobId) => {
        if (!contract || !account || !signer ) { setError("Please connect wallet to apply."); return; }

        const jobToApply = jobs.find(j => j.id === jobId);
        if (!jobToApply || jobToApply.employer.toLowerCase() === account.toLowerCase()) {
             setError("Cannot apply to your own job."); return;
        }
        if (jobToApply.rawStatus !== 0 || !jobToApply.isEscrowed) { // 0 = OPEN
             setError("Can only apply to open jobs where funds are escrowed."); return;
        }


        setApplyingJobId(jobId); updateTxStatus(jobId, 'loading', 'Submitting application...'); setError('');
        try {
             const txContract = contract.connect(signer);
             const tx = await txContract.applyForJob(jobId);
             updateTxStatus(jobId, 'loading', 'Confirming transaction...');
            await tx.wait();
            updateTxStatus(jobId, 'success', 'Applied successfully!');
            fetchJobs(); // Refresh list to show status change (job might become ASSIGNED)
        } catch (err) {
             console.error("Apply Error:", err);
             const message = err.reason || err.data?.message || err.message || "Failed to apply.";
             updateTxStatus(jobId, 'error', `Apply Failed: ${message.substring(0, 100)}...`);
        } finally { setApplyingJobId(null); }
    };

    // Render Logic
    if (loading) return <p className="info-message">Loading available jobs...</p>; // Show loading only initially
    // If not loading but error occurred (setError would be called) or no jobs found
    if (jobs.length === 0) return <p className="info-message">No open or assigned jobs found.</p>;

    // Filter jobs directly in render - only show OPEN or ASSIGNED
    const displayJobs = jobs.filter(job => job.rawStatus === 0 || job.rawStatus === 1); // 0=OPEN, 1=ASSIGNED

    if (displayJobs.length === 0) return <p className="info-message">No open or assigned jobs found.</p>;


    return (
        <div className="job-list-container">
            <h2>Available Jobs</h2>
            <ul className="job-list">
                {displayJobs.map((job) => {
                     const itemStyle = { borderLeftColor: getStatusColor(job.status) };
                     const isJobOpen = job.rawStatus === 0;
                     const viewerIsNotEmployer = account && job.employer.toLowerCase() !== account.toLowerCase();
                     // Apply button shown if job is OPEN, escrowed, and viewer isn't employer
                     const canApply = isJobOpen && job.isEscrowed && viewerIsNotEmployer;
                     const currentTxStatus = txStatus[job.id];

                     return (
                         <li key={job.id} className="job-item" style={itemStyle}>
                             {/* --- JOB TITLE LINK (ID REMOVED) --- */}
                             <h3><Link to={`/job/${job.id}`}>{job.title}</Link></h3>
                             {/* --- END LINK --- */}

                             <div className="job-meta-info">
                                 <span className={`job-meta-badge status-${job.status?.toLowerCase()}`}>{job.status}</span>
                                 <span className="job-meta-badge budget">{job.budget} ETH</span>
                                 <span className={`job-meta-badge escrow-${job.isEscrowed ? 'yes' : 'no'}`}>Escrowed: {job.isEscrowed ? 'Yes' : 'No'}</span>
                             </div>
                             {/* Use shortened address for employer display */}
                             <p className="employer-info">
                                <strong>Employer:</strong> {shortenAddress(job.employer)}
                             </p>

                             {/* --- Apply Button --- */}
                             {canApply && (
                                 <div className="job-item-actions"> {/* Wrapper for button/status */}
                                     <button
                                         className="apply-button"
                                         onClick={() => handleApply(job.id)}
                                         disabled={applyingJobId === job.id || !!currentTxStatus} // Disable if applying or has status
                                     >
                                         {applyingJobId === job.id ? 'Applying...' : 'Apply'}
                                     </button>
                                     {/* Show status message specific to this job item */}
                                     {currentTxStatus && (
                                        <p className={`action-status ${currentTxStatus.status}`}>
                                             {currentTxStatus.message}
                                         </p>
                                     )}
                                 </div>
                             )}
                             {/* Show simpler status if job is assigned and not apply-able */}
                             {!isJobOpen && (
                                 <p className="status-note">Job is currently assigned.</p>
                             )}
                             {!job.isEscrowed && isJobOpen && (
                                 <p className="status-note">Waiting for employer to escrow funds.</p>
                             )}
                         </li>
                     );
                })}
            </ul>
        </div>
    );
}

export default JobList;