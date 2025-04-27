// src/components/FreelancerDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { formatEther, ZeroAddress } from 'ethers'; // Import ZeroAddress
import { Link } from 'react-router-dom';
import { useWeb3Context } from '../contexts/Web3Context';
import './FreelancerDashboard.css'; // Import CSS

// --- ADDED: Helper Function ---
const shortenAddress = (address) => {
    if (!address || typeof address !== 'string' || address === ZeroAddress) return 'None'; // Check for ZeroAddress
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};
// --- END: Helper Function ---

// --- CORRECTED JobStatus Map (Matches Contract) ---
const JobStatus = {
    0: 'OPEN',
    1: 'ASSIGNED',
    2: 'AWAITING_APPROVAL',
    3: 'COMPLETED',
    4: 'REFUNDED',
    5: 'DISPUTED'
};
const getStatusColor = (status) => {
    // ... (getStatusColor function remains the same as corrected before)
    switch (status?.toLowerCase().replace('_', '')) {
        case 'open': return '#2ecc71';
        case 'assigned': return '#f39c12';
        case 'awaitingapproval': return '#3498db';
        case 'completed': return '#9b59b6';
        case 'refunded': return '#e74c3c';
        case 'disputed': return '#dc3545';
        default: return '#bdc3c7';
    }
};

// --- ADDED: IPFS Fetch Logic ---
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';

async function fetchDescriptionFromIPFS(cid) {
    // ... (fetchDescriptionFromIPFS function remains the same as added before)
    if (!cid || typeof cid !== 'string' || cid.length < 10) {
        return null;
    }
    const gateway = IPFS_GATEWAY.endsWith('/') ? IPFS_GATEWAY : `${IPFS_GATEWAY}/`;
    const url = `${gateway}${cid}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
             console.error(`IPFS fetch failed (${response.status}) for CID ${cid}`);
             return "[Error fetching description]";
        }
        const data = await response.json();
        return data?.description || "[Description not found in IPFS data]";
    } catch (error) {
        console.error(`Failed to fetch/parse description from IPFS CID ${cid}:`, error);
        return "[Error fetching description]";
    }
}
// --- End IPFS Fetch ---


function FreelancerDashboard() {
    const { contract, account, provider, signer, setError } = useWeb3Context();
    const [assignedJobs, setAssignedJobs] = useState([]);
    const [jobDescriptions, setJobDescriptions] = useState({});
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    // --- Fetch Jobs (Unchanged logic, but uses correct status map now) ---
    const fetchMyJobs = useCallback(async (isInitialLoad = false) => {
        // ... (fetchMyJobs function remains the same as corrected before)
        if (!contract || !account || !provider) {
            setAssignedJobs([]); return;
        }
        if (isInitialLoad) setLoading(true);
        setError('');
        let fetchedCIDs = {};
        try {
            const readContract = contract.connect(provider);
            const countBigInt = await readContract.getJobCount();
            const count = Number(countBigInt);
            const jobFetchPromises = [];
            for (let i = count; i >= 1; i--) {
                jobFetchPromises.push( /* ... async job fetch ... */
                    (async () => {
                        try {
                            const jobData = await readContract.getJob(i);
                            if (jobData.freelancer.toLowerCase() === account.toLowerCase()) {
                                const escrowAmount = await readContract.getEscrowAmount(i);
                                const statusNumber = Number(jobData.status);
                                const jobId = Number(jobData.id);
                                const descriptionCID = jobData.descriptionCID;
                                if (descriptionCID) { fetchedCIDs[jobId] = descriptionCID; }
                                return {
                                    id: jobId, title: jobData.title, budget: formatEther(jobData.budget),
                                    employer: jobData.employer, status: JobStatus[statusNumber] || 'Unknown',
                                    isEscrowed: escrowAmount > 0n && escrowAmount === jobData.budget,
                                    rawStatus: statusNumber, descriptionCID: descriptionCID
                                };
                            } return null;
                        } catch (jobError) { console.warn(`Could not fetch job ID ${i}:`, jobError); return null; }
                    })()
                );
            }
            const results = await Promise.all(jobFetchPromises);
            const fetchedJobs = results.filter(job => job !== null).sort((a, b) => b.id - a.id);
            setAssignedJobs(fetchedJobs);

            // Fetch descriptions
            const descriptionPromises = Object.entries(fetchedCIDs).map(([id, cid]) =>
                fetchDescriptionFromIPFS(cid).then(desc => ({ id: parseInt(id), description: desc }))
            );
            const descriptions = await Promise.all(descriptionPromises);
            setJobDescriptions(prev => {
                 const newDescriptions = {...prev};
                 descriptions.forEach(item => { if (item.description !== null) { newDescriptions[item.id] = item.description; }});
                 return newDescriptions;
             });
        } catch (err) { console.error("Fetch Jobs Error:", err); setError("Failed to fetch jobs.");
        } finally { if (isInitialLoad) setLoading(false); }
    }, [contract, account, provider, setError]);

    // --- Initial Fetch (Unchanged logic) ---
    useEffect(() => {
        // ... (useEffect logic remains the same as corrected before)
        let initialLoad = true; let interval;
        if (contract && account && provider) {
            setLoading(true);
            fetchMyJobs(true).finally(() => { setLoading(false); initialLoad = false; });
            // Add interval back if you want polling:
            // interval = setInterval(() => { if (!initialLoad) fetchMyJobs(); }, 30000);
        } else { setLoading(false); }
        return () => clearInterval(interval); // Ensure interval is defined if using
    }, [fetchMyJobs, contract, account, provider]);


    // --- Handle "Mark Work Done" Action (Unchanged logic) ---
    const handleMarkWorkDone = async (jobId) => {
        // ... (handleMarkWorkDone function remains the same as corrected before)
         if (!contract || !signer) { setError("Wallet or contract not ready."); return; }
         if (!window.confirm(`Mark work as done for Job #${jobId}? This will notify the employer to release payment.`)) return;
         setActionLoading(jobId); setError('');
         try {
             const writeContract = contract.connect(signer);
             console.log(`Calling markWorkDone for Job ID: ${jobId}`);
             const tx = await writeContract.markWorkDone(jobId);
             await tx.wait();
             console.log(`Work marked as done for Job ID: ${jobId}, Tx: ${tx.hash}`);
             fetchMyJobs();
         } catch (err) {
             console.error("Mark Work Done Error:", err);
             const message = err.reason || err.data?.message || err.message || "Failed.";
             setError(`Error marking Job #${jobId} done: ${message.substring(0, 100)}...`);
         } finally { setActionLoading(null); }
    };
    // --- End Handle Action ---


    // --- Render Logic ---
    if (!account) { return <p className="info-message">Please connect your wallet...</p>; }
    if (loading) return <p className="info-message">Loading your jobs...</p>;

    return (
        <div className="dashboard-container freelancer-dashboard">
            <h2>My Jobs (Applied/Completed)</h2>
            {assignedJobs.length === 0 ? (
                <p className="info-message">You haven't been assigned to any jobs yet. <Link to="/">Browse jobs?</Link></p>
            ) : (
                <ul className="dashboard-job-list">
                    {assignedJobs.map((job) => {
                        const itemStyle = { borderLeftColor: getStatusColor(job.status) };
                        const isActionLoading = actionLoading === job.id;
                        const descriptionText = jobDescriptions[job.id] || (job.descriptionCID ? "Loading description..." : "[No description provided]");

                        return (
                            <li key={job.id} className="dashboard-job-item" style={itemStyle}>
                                <h3><Link to={`/job/${job.id}`}>{job.title}</Link></h3>
                                <p>Status: <span className={`status-badge status-${job.status?.toLowerCase().replace('_','-')}`}>{job.status}</span> | Budget: {job.budget} ETH</p>
                                {/* --- CORRECTED: Now uses defined shortenAddress --- */}
                                <p>Employer: {shortenAddress(job.employer)}</p>

                                {/* --- Display Description --- */}
                                <p className="job-item-description">
                                    <strong>Description: </strong>
                                    {descriptionText.length > 150 ? `${descriptionText.substring(0, 150)}...` : descriptionText}
                                    {descriptionText.length > 150 && <Link to={`/job/${job.id}`} style={{marginLeft: '5px'}}>(more)</Link>}
                                </p>

                                {/* --- Conditional Status Messages & Action Button (logic unchanged) --- */}
                                {job.rawStatus === 1 && ( /* Assigned */
                                    <div className="job-actions-freelancer">
                                        <p className="status-indicator">Work in progress...</p>
                                        <button className="action-button work-done-button" onClick={() => handleMarkWorkDone(job.id)} disabled={isActionLoading}>
                                            {isActionLoading ? 'Marking...' : 'Mark Work Done'}
                                        </button>
                                    </div>
                                )}
                                {job.rawStatus === 2 && ( /* Awaiting Approval */
                                    <p className="status-indicator awaiting">Work marked as done. Awaiting employer payment release...</p>
                                )}
                                {job.rawStatus === 3 && ( /* Completed */
                                    <p className="status-indicator success">Payment received!</p>
                                )}
                                 {job.rawStatus === 4 && ( /* Refunded */
                                    <p className="status-indicator error">Job was refunded to employer.</p>
                                 )}
                                 {job.rawStatus === 5 && ( /* Disputed */
                                    <p className="status-indicator error">Job is currently in dispute.</p>
                                 )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default FreelancerDashboard;