// src/components/EmployerDashboard.jsx
// Updated status map and added logging for handleAction

import React, { useState, useEffect, useCallback } from 'react';
import { formatEther, ZeroAddress, parseEther } from 'ethers'; // Removed unused parseEther for now
import { Link } from 'react-router-dom';
import { useWeb3Context } from '../contexts/Web3Context';
import './EmployerDashboard.css';

// Helper Function (Assuming implementation exists elsewhere or is simple)
const shortenAddress = (address) => {
    if (!address || address === ZeroAddress) return 'None';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Status mapping to match contract
const JobStatus = {
    0: 'OPEN', 1: 'ASSIGNED', 2: 'AWAITING_APPROVAL',
    3: 'COMPLETED', 4: 'REFUNDED', 5: 'DISPUTED'
};

// Status color mapping (Assuming implementation exists and handles AWAITING_APPROVAL)
const getStatusColor = (status) => {
    switch (status) {
        case 'OPEN': return '#3498db'; // Blue
        case 'ASSIGNED': return '#f39c12'; // Orange
        case 'AWAITING_APPROVAL': return '#e67e22'; // Darker Orange
        case 'COMPLETED': return '#2ecc71'; // Green
        case 'REFUNDED': return '#7f8c8d'; // Gray
        case 'DISPUTED': return '#e74c3c'; // Red
        default: return '#bdc3c7'; // Light Gray
    }
};


function EmployerDashboard() {
    const { contract, account, provider, setError, signer } = useWeb3Context();
    const [myJobs, setMyJobs] = useState([]);
    const [loading, setLoading] = useState(true); // Start loading initially
    const [actionStates, setActionStates] = useState({});

    // Helper to update action state
    const updateActionState = (jobId, state, message = '') => {
        setActionStates(prev => ({
            ...prev,
            [jobId]: state ? { state, message } : null // Clear state if null
        }));
        // Optional: Auto-clear success/error messages after a delay
        if (state === 'success' || state === 'error') {
            setTimeout(() => {
                setActionStates(prev => ({
                    ...prev,
                    [jobId]: null
                }));
            }, 5000); // Clear after 5 seconds
        }
    };


    // Fetch jobs posted by the current employer
    const fetchMyJobs = useCallback(async () => {
        console.log("Fetching jobs for account:", account);
        if (!contract || !account || !provider) {
            console.log("Fetch aborted: Missing contract, account, or provider.");
            setMyJobs([]);
            setLoading(false); // Stop loading if prerequisites missing
            return;
        }
        setLoading(true); // Set loading true when fetch starts
        try {
            // Use provider for read-only calls
            const readContract = contract.connect(provider);
            const countBigInt = await readContract.getJobCount();
            const count = Number(countBigInt);
            console.log("Total job count from contract:", count);

            if (count === 0) {
                 setMyJobs([]);
                 setLoading(false);
                 return;
            }

            const fetchedJobsPromises = [];
            // Loop from latest job ID down to 1
            for (let i = count; i >= 1; i--) {
                fetchedJobsPromises.push(
                    (async () => {
                        try {
                            const jobData = await readContract.getJob(i);
                            // Filter jobs where the current account is the employer
                            if (jobData.employer.toLowerCase() === account.toLowerCase()) {
                                const escrowAmount = await readContract.getEscrowAmount(i);
                                // Check if escrow amount is greater than 0 AND matches the budget
                                const isEscrowed = escrowAmount > 0n && escrowAmount === jobData.budget;
                                const statusNum = Number(jobData.status);
                                return {
                                    id: Number(jobData.id),
                                    title: jobData.title,
                                    budget: formatEther(jobData.budget),
                                    freelancer: jobData.freelancer === ZeroAddress ? 'None' : jobData.freelancer,
                                    status: JobStatus[statusNum] || 'Unknown', // Use updated map
                                    isEscrowed: isEscrowed,
                                    rawStatus: statusNum,
                                    rawBudget: jobData.budget, // Keep raw budget (BigInt) for transactions
                                };
                            }
                            return null; // Return null if not the employer's job
                        } catch (jobError) {
                            console.warn(`Failed to fetch details for job ${i}:`, jobError);
                            // Optionally, you could return an error object here to display in the UI
                            return null; // Skip jobs that fail to load
                        }
                    })()
                );
            }

            const results = await Promise.all(fetchedJobsPromises);
            const fetchedJobs = results
                .filter(job => job !== null) // Filter out nulls (non-employer jobs or errors)
                .sort((a, b) => b.id - a.id); // Sort by ID descending (newest first)

            console.log("Fetched employer jobs:", fetchedJobs);
            setMyJobs(fetchedJobs);

        } catch (err) {
            console.error("Error in fetchMyJobs:", err);
            setError("Failed to fetch your jobs. Please try refreshing.");
            setMyJobs([]); // Clear jobs on error
        } finally {
            setLoading(false); // Ensure loading is set to false after fetch attempt
        }
    }, [contract, account, provider, setError]); // Dependencies for useCallback

    // Effect for initial fetch and setting up polling or event listeners
    useEffect(() => {
        if (contract && account && provider) {
            fetchMyJobs();

            // Example: Simple polling every 30 seconds
            const intervalId = setInterval(fetchMyJobs, 30000);

            // Example: Set up event listeners (more efficient than polling)
            // Make sure your contract ABI includes these events
            const handleJobEvent = (jobId, ...args) => {
                console.log(`Event detected for job ${jobId}, refreshing list...`);
                // Simple refresh - could be optimized to update only the specific job
                fetchMyJobs();
            };

            const eventsToListen = [
                "JobPosted", "JobApplied", "PaymentEscrowed",
                "PaymentReleased", "EmployerRefunded", "DisputeRaised",
                "DisputeResolved", "WorkSubmitted"
            ];

            eventsToListen.forEach(eventName => {
                contract.on(eventName, handleJobEvent);
            });


            // Cleanup function
            return () => {
                clearInterval(intervalId); // Clear interval on component unmount
                // Remove event listeners
                 eventsToListen.forEach(eventName => {
                    contract.off(eventName, handleJobEvent);
                 });
                console.log("Cleaned up EmployerDashboard intervals and listeners.");
            };
        } else {
             setLoading(false); // Ensure loading is off if context isn't ready
        }
    }, [fetchMyJobs, contract, account, provider]); // Rerun effect if context changes

    // Handle dashboard actions (ESCROW, RELEASE, REFUND)
    const handleAction = async (actionType, job) => {
        // *** 1. LOG AT START ***
        console.log(`>>> handleAction called with type: "${actionType}", job ID: ${job?.id}`);
        console.log(">>> Full job object received:", job);

        // Pre-action validation
        if (!contract || !account || !job || !signer || !job.id || job.rawBudget === undefined || job.rawBudget === null) {
            console.error("Pre-action validation failed:", {
                hasContract: !!contract,
                hasAccount: !!account,
                hasJob: !!job,
                hasSigner: !!signer,
                hasJobId: !!job?.id,
                hasRawBudget: job?.rawBudget !== undefined && job?.rawBudget !== null
            });
            // Use Date.now() as a fallback key if job.id is somehow missing
            updateActionState(job?.id || Date.now(), 'error', 'Wallet/Contract/Job Data not ready. Refresh and try again.');
            return;
        }

        // Confirmation Logic
        let confirmNeeded = false;
        let confirmMsg = '';
        if (actionType === 'RELEASE') {
            // Release requires AWAITING_APPROVAL (2) status
            if (job.rawStatus !== 2) {
                updateActionState(job.id, 'error', 'Job is not awaiting approval.');
                return;
            }
            confirmNeeded = true;
            confirmMsg = `Are you sure you want to release ${job.budget} ETH to freelancer ${shortenAddress(job.freelancer)}? This action cannot be undone.`;
        } else if (actionType === 'REFUND') {
             // Refund requires OPEN (0) status and escrow to be present + delay check (done in contract)
            if (job.rawStatus !== 0) {
                updateActionState(job.id, 'error', 'Refund only possible for OPEN jobs.');
                return;
            }
             if (!job.isEscrowed) {
                updateActionState(job.id, 'error', 'Funds not escrowed for this job.');
                 return;
            }
            // Note: The 7-day delay check is handled by the smart contract itself.
            confirmNeeded = true;
            confirmMsg = `Are you sure you want to request a refund of ${job.budget} ETH? This is only possible if the job has remained OPEN for 7 days after escrow.`;
        } else if (actionType === 'ESCROW') {
            if (job.rawStatus !== 0) {
                 updateActionState(job.id, 'error', 'Can only escrow for OPEN jobs.');
                 return;
            }
             if (job.isEscrowed) {
                 updateActionState(job.id, 'error', 'Funds already escrowed for this job.');
                 return;
             }
             // No confirmation usually needed for escrow, but can add if desired
             // confirmNeeded = true;
             // confirmMsg = `Escrow ${job.budget} ETH for this job?`;
        }

        if (confirmNeeded && !window.confirm(confirmMsg)) {
            console.log("User cancelled action:", actionType);
            return; // User cancelled
        }

        updateActionState(job.id, 'loading', `${actionType} in progress...`);
        setError(''); // Clear global errors
        const actionContract = contract.connect(signer); // Contract instance with signer for transaction

        try {
            let tx;
            console.log(`Attempting contract call for ${actionType}, Job ID: ${job.id}`);

            // *** 2. LOG BEFORE SWITCH ***
            console.log(`>>> VALUE BEFORE SWITCH: actionType = "${actionType}" (Type: ${typeof actionType})`);

            switch (actionType) {
                case 'ESCROW':
                    // Double-check conditions just before sending transaction
                    if (job.rawStatus !== 0) throw new Error("Job must be OPEN to escrow.");
                    if (job.isEscrowed) throw new Error("Funds already escrowed.");
                    console.log(`Calling contract.escrowFunds(${job.id}, { value: ${job.rawBudget?.toString()} })`);
                    tx = await actionContract.escrowFunds(job.id, { value: job.rawBudget });
                    break;

                case 'RELEASE':
                     // Double-check condition
                    if (job.rawStatus !== 2) throw new Error("Job must be AWAITING_APPROVAL to release.");
                    console.log(`Calling contract.releasePayment(${job.id})`);
                    tx = await actionContract.releasePayment(job.id);
                    break;

                case 'REFUND':
                    // Double-check conditions (contract handles time delay)
                    if (job.rawStatus !== 0) throw new Error("Job must be OPEN to refund.");
                     if (!job.isEscrowed) throw new Error("Funds not escrowed to refund.");
                    console.log(`Calling contract.refundEmployer(${job.id})`);
                    tx = await actionContract.refundEmployer(job.id);
                    break;

                default:
                    // *** 3. ENHANCED LOG IN DEFAULT CASE ***
                    console.error(`!!! HIT DEFAULT CASE IN SWITCH !!! actionType received: "${actionType}" (Type: ${typeof actionType})`);
                    throw new Error(`Invalid action type provided: ${actionType}`); // Throw the specific error
            }

            updateActionState(job.id, 'loading', `Transaction sent. Waiting for confirmation...`);
            console.log(`Transaction hash for ${actionType} (${job.id}): ${tx.hash}`);
            await tx.wait(); // Wait for the transaction to be mined
            console.log(`${actionType} transaction confirmed for job ${job.id}`);
            updateActionState(job.id, 'success', `${actionType} successful!`);
            fetchMyJobs(); // Refresh the job list to show updated status/escrow state

        } catch (err) {
            console.error(`ERROR during ${actionType} for Job ${job.id}:`, err);
            // Attempt to extract a more specific revert reason from the error object
            let specificError = "An unknown error occurred.";
            if (err.reason) { // Ethers v5/v6 specific revert reason
                specificError = err.reason;
            } else if (err.data?.message) { // Error data message (e.g., from Hardhat node)
                specificError = err.data.message;
            } else if (err.message) { // General error message
                specificError = err.message;
            }
            // Extract common contract require messages
             if (specificError.includes("JobBoard:")) {
                 specificError = specificError.split("JobBoard: ")[1]?.trim() || specificError;
             }

            let displayMessage = `${actionType} Failed: ${specificError.substring(0, 150)}`; // Show more characters
             if (specificError.length > 150) displayMessage += "...";

            // If it's the specific "Invalid action type" error from the switch default:
            if (specificError.startsWith("Invalid action type provided:")) {
                 displayMessage = `Internal Error: ${specificError}`; // Make it clearer it's a frontend issue
            }


            updateActionState(job.id, 'error', displayMessage);
            setError(`Action failed. See details on the job card.`); // Set a general error as well if needed
        }
    };

    // --- Render Logic ---
    if (!account) {
        return <div className="info-message"><p>Please connect your wallet to view the employer dashboard.</p></div>;
    }

    if (loading && myJobs.length === 0) {
        return <div className="info-message"><p>Loading your jobs...</p></div>;
    }

    return (
        <div className="dashboard-container employer-dashboard">
            <h2>Employer Dashboard</h2>
            <p>Connected as: {shortenAddress(account)}</p>
            <h3>My Posted Jobs</h3>

            {myJobs.length === 0 && !loading ? (
                <div className="info-message">
                    <p>You haven't posted any jobs yet.</p>
                </div>
            ) : (
                <ul className="dashboard-job-list">
                    {myJobs.map((job) => {
                        const currentActionState = actionStates[job.id];
                        // Determine button visibility based on job status and escrow state
                        const isJobOpen = job.rawStatus === 0; // Index for OPEN
                        const isJobAssigned = job.rawStatus === 1; // Index for ASSIGNED
                        const isJobAwaiting = job.rawStatus === 2; // Index for AWAITING_APPROVAL
                        const isJobCompleted = job.rawStatus === 3; // Index for COMPLETED
                        const isJobRefunded = job.rawStatus === 4; // Index for REFUNDED
                        const isJobDisputed = job.rawStatus === 5; // Index for DISPUTED

                        // Derived flags for button logic
                        const canEscrow = isJobOpen && !job.isEscrowed && !isJobDisputed;
                        const canRelease = isJobAwaiting && !isJobDisputed; // Only possible when awaiting approval
                        const canRefund = isJobOpen && job.isEscrowed && !isJobDisputed; // Possible only if OPEN and escrowed (contract checks delay)

                        const itemStyle = { borderLeft: `5px solid ${getStatusColor(job.status)}` };

                        return (
                            <li key={job.id} className="dashboard-job-item" style={itemStyle}>
                                <div className="job-item-header">
                                    <h3><Link to={`/job/${job.id}`}>{job.title || "Untitled Job"}</Link></h3>
                                    <span className={`status-badge ${job.status.toLowerCase()}`} style={{backgroundColor: getStatusColor(job.status)}}>
                                        {job.status}
                                    </span>
                                </div>
                                <div className="job-meta-info">
                                     <p>Budget: {job.budget} ETH</p>
                                     <p>Escrowed: {job.isEscrowed ? 'Yes' : 'No'}</p>
                                     <p className="freelancer-info">Freelancer: {shortenAddress(job.freelancer)}</p>
                                </div>

                                {/* Action Buttons Area */}
                                <div className="job-actions">
                                    {/* Only show actions if job is NOT completed, refunded, or disputed */}
                                    {!isJobCompleted && !isJobRefunded && !isJobDisputed && (
                                        <>
                                            {canEscrow && <button className="action-button escrow" onClick={() => handleAction('ESCROW', job)} disabled={!!currentActionState}>Escrow Funds</button>}
                                            {canRelease && <button className="action-button release" onClick={() => handleAction('RELEASE', job)} disabled={!!currentActionState}>Release Payment</button>}
                                            {canRefund && <button className="action-button refund" onClick={() => handleAction('REFUND', job)} disabled={!!currentActionState} title="Request refund (possible 7 days after escrow if still OPEN)">Request Refund</button>}
                                            {/* Add Dispute button if needed */}
                                            {(isJobAssigned || isJobAwaiting) &&
                                                <button className="action-button dispute" onClick={() => handleAction('DISPUTE', job)} disabled={!!currentActionState} title="Raise a dispute (requires contract function)">Raise Dispute</button>
                                             }

                                        </>
                                    )}
                                     {/* Display messages for final states */}
                                     {isJobCompleted && <p className="final-status-message">Job Completed</p>}
                                     {isJobRefunded && <p className="final-status-message">Job Refunded</p>}
                                     {isJobDisputed && <p className="final-status-message disputed">Job Disputed - Awaiting Resolution</p>}
                                </div>

                                {/* Action Status/Feedback Area */}
                                {currentActionState && (
                                    <p className={`action-status ${currentActionState.state}`}>
                                        {currentActionState.message || currentActionState.state}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="dashboard-actions-footer">
                <Link to="/post-job" className="post-job-button">Post New Job</Link>
            </div>
        </div>
    );
}

export default EmployerDashboard;