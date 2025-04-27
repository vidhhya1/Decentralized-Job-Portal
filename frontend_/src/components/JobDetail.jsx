// src/components/JobDetail.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatEther, ZeroAddress } from 'ethers';
import { useWeb3Context } from '../contexts/Web3Context';
import io from 'socket.io-client'; // <-- Import Socket.IO client
import './JobDetail.css'; // Ensure you have the updated CSS

// --- Socket Configuration ---
// IMPORTANT: Replace with your actual backend server URL
// Use environment variable or hardcode for local testing
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';
let socket = null; // Keep socket reference outside component render cycle

// --- Helper Function ---
const shortenAddress = (address) => {
    if (!address || typeof address !== 'string' || address === ZeroAddress) return 'None';
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// --- Status mapping ---
const JobStatus = {
    0: 'OPEN', 1: 'ASSIGNED', 2: 'AWAITING_APPROVAL',
    3: 'COMPLETED', 4: 'REFUNDED', 5: 'DISPUTED'
};
const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase().replace('_', '');
    switch (statusLower) {
        case 'open': return '#2ecc71';
        case 'assigned': return '#f39c12';
        case 'awaitingapproval': return '#3498db';
        case 'completed': return '#9b59b6';
        case 'refunded': return '#e74c3c';
        case 'disputed': return '#dc3545';
        default: return '#bdc3c7';
    }
};
// --- End Status mapping ---

function JobDetail() {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const { contract, account, provider, setError, signer } = useWeb3Context();

    // --- Component State ---
    const [job, setJob] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [actionError, setActionError] = useState('');
    const [actionSuccess, setActionSuccess] = useState('');

    // --- Chat State ---
    const [chatMessages, setChatMessages] = useState([]); // Messages for the current session
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef(null);
    const [isChatConnected, setIsChatConnected] = useState(false); // Socket connection status
    // --- End Chat State ---

    // --- Permissions State ---
    const [isEmployer, setIsEmployer] = useState(false);
    const [isAssignedFreelancer, setIsAssignedFreelancer] = useState(false);
    const [isJobDisputedState, setIsJobDisputedState] = useState(false);
    const [isAwaitingApprovalState, setIsAwaitingApprovalState] = useState(false);
    // --- End Permissions State ---

    // --- Auto-scroll chat ---
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]);

    // --- Socket Connection and Event Handling ---
    useEffect(() => {
        // Determine if chat should be active based on job state
        let shouldChatBeActive = false;
        if (job && account && (isEmployer || isAssignedFreelancer)) {
            const status = job.rawStatus;
            // Chat active for Assigned, Awaiting Approval, or Disputed jobs
            shouldChatBeActive = status === 1 || status === 2 || status === 5;
        }

        if (shouldChatBeActive && jobId && account) {
            // Connect if not already connected
            if (!socket || !socket.connected) {
                if (socket) socket.disconnect(); // Clean up any lingering disconnected socket instance

                console.log(`Connecting socket for job ${jobId} (live only) at ${SOCKET_URL}...`);
                socket = io(SOCKET_URL, {
                    reconnectionAttempts: 3,
                    // Send necessary info for backend to identify user and join room
                    query: {
                        userId: account,
                        jobId: jobId
                    }
                });

                // --- Socket Event Listeners ---
                socket.on('connect', () => {
                    console.log('Socket connected:', socket.id);
                    setIsChatConnected(true);
                    // Optional: Emit joinRoom explicitly if backend requires it beyond query params
                    // socket.emit('joinRoom', jobId);
                });

                // Listen for incoming messages broadcast by the server
                socket.on('receiveMessage', (message) => {
                    console.log(`Received message for job ${jobId}:`, message);
                     if (message && message.text && message.senderDisplay) {
                         const formattedMessage = {
                             sender: message.senderDisplay,
                             text: message.text,
                             timestamp: message.timestamp || new Date().toISOString()
                         };
                         // Add the received message to our local state for display
                         setChatMessages((prevMessages) => [...prevMessages, formattedMessage]);
                     } else {
                         console.warn("Received invalid message format:", message);
                     }
                });

                socket.on('disconnect', (reason) => {
                    console.log('Socket disconnected:', reason);
                    setIsChatConnected(false);
                    // Optional: Clear messages on disconnect, or let refresh handle it
                    // setChatMessages([]);
                });

                socket.on('connect_error', (err) => {
                    console.error('Socket connection error:', err.message);
                    setIsChatConnected(false);
                    if (socket) socket.disconnect(); // Prevent loops if server is down
                    socket = null;
                });
            }
        } else {
            // If chat conditions are not met, ensure socket is disconnected
            if (socket && socket.connected) {
                console.log(`Chat conditions unmet/changed for job ${jobId}. Disconnecting socket...`);
                socket.emit('leaveRoom', jobId); // Notify backend (optional but good practice)
                socket.disconnect();
                socket = null;
                setIsChatConnected(false);
                setChatMessages([]); // Clear messages when chat area is hidden/inactive
            } else if (socket) {
                 socket = null; // Clear reference if exists but not connected
            }
        }

        // --- Cleanup Function ---
        // This runs when the component unmounts or dependencies change
        return () => {
            if (socket) {
                console.log(`Cleaning up socket for job ${jobId || 'previous job'}...`);
                // Remove listeners to prevent memory leaks
                socket.off('connect');
                socket.off('receiveMessage');
                socket.off('disconnect');
                socket.off('connect_error');

                // Disconnect if still connected
                if (socket.connected) {
                    socket.emit('leaveRoom', jobId);
                    socket.disconnect();
                }
                socket = null; // Clear the reference
                setIsChatConnected(false);
                // State resets on remount anyway, no need to clear chatMessages here
            }
        };
        // Dependencies: Re-run effect if these change
    }, [job, account, jobId, isEmployer, isAssignedFreelancer]); // Removed SOCKET_URL as it's const


    // --- Fetch Job Detail Logic ---
    const fetchJobDetail = useCallback(async () => {
        setJob(null);
        // Note: We no longer manipulate chatMessages here directly on fetch
        if (!contract || !provider || !jobId ) { setLoading(false); return; }
        setLoading(true); setError(''); setActionError(''); setActionSuccess('');

        try {
            const readContract = contract.connect(provider);
            const jobData = await readContract.getJob(jobId);

            if (!jobData || jobData.employer === ZeroAddress || Number(jobData.id) === 0) {
                throw new Error("Job not found");
            }

            const escrowAmount = await readContract.getEscrowAmount(jobId);
            const statusNum = Number(jobData.status);
            const jobStatusText = JobStatus[statusNum] || 'Unknown';
            const currentAccountLower = account ? account.toLowerCase() : null;
            const employerAddressLower = jobData.employer ? jobData.employer.toLowerCase() : null;
            const freelancerAddressLower = jobData.freelancer !== ZeroAddress ? jobData.freelancer.toLowerCase() : null;

            // Determine roles and states
            const isEmp = !!(currentAccountLower && employerAddressLower && currentAccountLower === employerAddressLower);
            const isFln = !!(currentAccountLower && freelancerAddressLower && currentAccountLower === freelancerAddressLower);
            const isDisputed = statusNum === 5;
            const isAwaiting = statusNum === 2;

            // Set role states first, needed by socket effect
            setIsEmployer(isEmp);
            setIsAssignedFreelancer(isFln);
            setIsJobDisputedState(isDisputed);
            setIsAwaitingApprovalState(isAwaiting);

            const newJob = {
                id: Number(jobData.id), title: jobData.title, description: jobData.description,
                budget: formatEther(jobData.budget), employer: jobData.employer,
                freelancer: jobData.freelancer === ZeroAddress ? 'None' : jobData.freelancer,
                status: jobStatusText,
                isEscrowed: escrowAmount > 0n && escrowAmount === jobData.budget,
                rawStatus: statusNum, rawBudget: jobData.budget,
            };
            setJob(newJob); // Set job state, triggering socket effect if needed

            // --- REMOVED LOCAL CHAT INITIALIZATION LOGIC ---
            // Socket useEffect now handles connection and message state

        } catch (err) {
             console.error("Fetch Job Detail Error:", err);
             const errorMsg = err.message?.includes("Job not found") || err.reason?.includes("Job does not exist")
                 ? `Job with ID ${jobId} not found.`
                 : `Failed to fetch job details: ${err.message}`;
             setActionError(errorMsg);
             setJob(null); setIsEmployer(false); setIsAssignedFreelancer(false); setIsJobDisputedState(false); setIsAwaitingApprovalState(false);
             setChatMessages([]); // Clear chat messages on fetch error
        } finally { setLoading(false); }
        // Dependencies: contract, provider, jobId, setError, account
    }, [contract, provider, jobId, setError, account]);

    useEffect(() => {
        fetchJobDetail();
    }, [fetchJobDetail]); // Rerun fetch if function reference changes (due to its dependencies)

    // --- Emit System Messages Helper ---
    const emitSystemMessage = useCallback((text) => {
        if (socket && socket.connected && job) {
            const systemMsg = {
                jobId: job.id,
                sender: 'System', // Can customize if needed
                senderDisplay: 'System',
                text: text,
                timestamp: new Date().toISOString()
            };
            // Use the same event as user messages for simplicity
            socket.emit('sendMessage', systemMsg);
        } else {
            console.warn("Socket not connected, system message not sent:", text);
            // Fallback: Maybe add locally? (Only sender sees it)
            // setChatMessages(prev => [...prev, { sender: 'System', text: `(Offline) ${text}`, timestamp: new Date().toISOString() }]);
        }
    }, [job]); // Depends on job being available to get jobId

    // --- Handle Standard Actions (Emit System Messages) ---
    const handleAction = async (actionType) => {
        console.log(`>>> handleAction called in JobDetail with type: "${actionType}", job ID: ${job?.id}`); // Log entry
        if (!contract || !account || !job || !signer) {
             setActionError("Wallet/Contract not ready.");
             console.error("Action aborted: Wallet/Contract/Job/Signer not ready.");
             return;
        }

        // --- Confirmation Logic (Example - adapt as needed) ---
        let confirmNeeded = false;
        let confirmMsg = '';
        if (actionType === 'RELEASE') {
             if (job.rawStatus !== 2) { setActionError("Job not awaiting approval."); return; }
             confirmNeeded = true;
             confirmMsg = `Release ${job.budget} ETH to ${shortenAddress(job.freelancer)}?`;
        } else if (actionType === 'REFUND') {
            if (job.rawStatus !== 0) { setActionError("Job must be OPEN to refund."); return; }
             if (!job.isEscrowed) { setActionError("Funds not escrowed."); return; }
             confirmNeeded = true;
             confirmMsg = `Request refund of ${job.budget} ETH? (Requires 7 day delay after escrow)`;
        } else if (actionType === 'RAISE_DISPUTE') {
             if (job.rawStatus !== 1 && job.rawStatus !== 2) { setActionError("Can only dispute ASSIGNED or AWAITING_APPROVAL jobs."); return; }
             confirmNeeded = true;
             confirmMsg = "Are you sure you want to raise a dispute? This will lock further actions until resolved.";
        }
        // Add confirmations for APPLY, ESCROW if desired

        if (confirmNeeded && !window.confirm(confirmMsg)) {
             console.log("User cancelled action:", actionType);
             return;
        }
        // --- End Confirmation ---

        setActionLoading(actionType); setActionError(''); setActionSuccess('');
        const actionContract = contract.connect(signer);
        try {
            let tx;
            const internalJobId = job.id; // Use job state
            const internalRawBudget = job.rawBudget; // Use job state

            // *** DEBUGGING LOG: BEFORE SWITCH ***
            console.log(`>>> VALUE BEFORE SWITCH (JobDetail): actionType = "${actionType}" (Type: ${typeof actionType})`);

            switch(actionType) {
                case 'APPLY': // Assumes applyForJob exists and takes jobId
                    if (job.rawStatus !== 0) throw new Error("Job is not OPEN.");
                    if (!job.isEscrowed) throw new Error("Funds must be escrowed before applying.");
                    if (isEmployer) throw new Error("Employer cannot apply.");
                    console.log(`Calling contract.applyForJob(${internalJobId})`);
                    tx = await actionContract.applyForJob(internalJobId);
                    break;
                case 'ESCROW':
                    if (job.rawStatus !== 0) throw new Error("Job must be OPEN.");
                    if (job.isEscrowed) throw new Error("Funds already escrowed.");
                     if (!isEmployer) throw new Error("Only employer can escrow funds.");
                    console.log(`Calling contract.escrowFunds(${internalJobId}, { value: ${internalRawBudget?.toString()} })`);
                    tx = await actionContract.escrowFunds(internalJobId, { value: internalRawBudget });
                    break;
                 case 'RELEASE':
                     if (job.rawStatus !== 2) throw new Error("Job must be AWAITING_APPROVAL.");
                     if (!isEmployer) throw new Error("Only employer can release funds.");
                    console.log(`Calling contract.releasePayment(${internalJobId})`);
                     tx = await actionContract.releasePayment(internalJobId);
                    break;
                 case 'REFUND': // Assumes refundEmployer exists
                     if (job.rawStatus !== 0) throw new Error("Job must be OPEN.");
                     if (!job.isEscrowed) throw new Error("Funds not escrowed.");
                     if (!isEmployer) throw new Error("Only employer can request refund.");
                     console.log(`Calling contract.refundEmployer(${internalJobId})`);
                    tx = await actionContract.refundEmployer(internalJobId);
                    break;
                case 'RAISE_DISPUTE':
                    if (job.rawStatus !== 1 && job.rawStatus !== 2) throw new Error("Can only dispute ASSIGNED or AWAITING_APPROVAL jobs.");
                    if (!isEmployer && !isAssignedFreelancer) throw new Error("Only employer or freelancer can raise dispute.");
                    console.log(`Calling contract.raiseDispute(${internalJobId})`);
                    tx = await actionContract.raiseDispute(internalJobId);
                    break;
                default:
                     // *** DEBUGGING LOG: INSIDE DEFAULT CASE ***
                     console.error(`!!! HIT DEFAULT CASE IN SWITCH (JobDetail) !!! actionType received: "${actionType}" (Type: ${typeof actionType})`);
                     throw new Error(`Invalid action type: ${actionType}`); // <<< THIS IS THE ERROR SOURCE
            }

            setActionLoading(`Confirming ${actionType}...`); // Update loading message
            await tx.wait();
            const successMsgText = `${actionType.replace('_', ' ')} successful!`;
            setActionSuccess(successMsgText);

            // Emit system message for relevant actions
            if (actionType === 'RAISE_DISPUTE') {
                emitSystemMessage(`Dispute raised by ${shortenAddress(account)}. Please discuss.`);
            } else if (actionType === 'RELEASE') {
                 emitSystemMessage(`Payment released by Employer (${shortenAddress(account)}). Job complete.`);
            } else if (actionType === 'APPLY') {
                 emitSystemMessage(`User ${shortenAddress(account)} applied and was assigned as Freelancer.`);
            } else if (actionType === 'ESCROW') {
                 emitSystemMessage(`Employer (${shortenAddress(account)}) escrowed ${job.budget} ETH.`);
            } else if (actionType === 'REFUND') {
                 emitSystemMessage(`Employer (${shortenAddress(account)}) received refund. Job closed.`);
            }
            // Add more emits if desired

            setTimeout(() => {
                 fetchJobDetail(); // Refresh job state after a short delay
                 setActionSuccess(''); // Clear success message after refresh
            }, 1500);

        } catch (err) {
            console.error(`${actionType} Error:`, err); // <-- Line ~296 from your log
            const message = err.reason || err.data?.message || err.message || `Failed ${actionType}`;
            // Try to clean up contract revert messages
            let cleanMessage = message.replace('execution reverted: JobBoard: ', '');
            setActionError(`${actionType.replace('_', ' ')} Failed: ${cleanMessage.substring(0,150)}...`);
        } finally {
            setActionLoading(null); // Clear loading regardless of outcome
        }
    };
    // --- End handleAction ---

    // --- Handle Mark Work Done (Emit System Message) ---
    const handleMarkWorkDone = async () => {
        if (!contract || !account || !job || !signer || !isAssignedFreelancer) {
            setActionError("Only the assigned freelancer can mark work as done."); return;
        }
        if (job.rawStatus !== 1) { // 1 = ASSIGNED
            setActionError("Work can only be marked as done for an assigned job."); return;
        }
        if (!window.confirm('Mark work as done and notify employer?')) { return; }

        setActionLoading('MARK_DONE'); setActionError(''); setActionSuccess('');
        const actionContract = contract.connect(signer);
        try {
            const tx = await actionContract.markWorkDone(job.id);
            await tx.wait();
            setActionSuccess('Work successfully marked as done! Waiting for employer approval.');

            // Emit system message via socket
            emitSystemMessage(`Work marked as done by Freelancer (${shortenAddress(account)}). Awaiting Employer payment release.`);

            setTimeout(() => {
                fetchJobDetail();
                setActionSuccess(''); // Clear success message
                }, 1500); // Refresh job state
        } catch (err) {
            console.error("Mark Work Done Error:", err);
            const message = err.reason || err.data?.message || err.message || "Failed";
             let cleanMessage = message.replace('execution reverted: JobBoard: ', '');
            setActionError(`Submission Failed: ${cleanMessage.substring(0,150)}...`);
        } finally {
            setActionLoading(null); // Clear loading
        }
    };
    // --- End handleMarkWorkDone ---

    // --- Chat Send Message Handler (Emit via Socket) ---
    const handleSendMessage = () => {
        // Validations
        if (!newMessage.trim()) { setActionError("Message cannot be empty."); return; }
        if (!account) { setActionError("Connect wallet to send messages."); return; }
        if (!job) { setActionError("Job data not loaded."); return; }
        if (!socket || !socket.connected) {
            setActionError("Chat not connected. Cannot send message.");
            console.warn("Attempted to send message while socket disconnected.");
            return;
        }

        // Determine sender display name
        let senderDisplay = shortenAddress(account);
        if (isEmployer) senderDisplay += ' (Employer)';
        else if (isAssignedFreelancer) senderDisplay += ' (Freelancer)';

        // Prepare message payload
        const messageToSend = {
            jobId: job.id, // Crucial for backend routing
            sender: account, // Raw address if needed by backend
            senderDisplay: senderDisplay, // Name shown in chat
            text: newMessage,
            timestamp: new Date().toISOString() // Client timestamp
        };

        console.log("Emitting live message:", messageToSend);
        // Emit the message to the server via WebSocket
        socket.emit('sendMessage', messageToSend);

        // Clear the input field ONLY (message appears when received back via broadcast)
        setNewMessage('');
        setActionError(''); // Clear any previous send errors
    };
    // --- End Chat handling ---

    // --- Render Logic ---
    if (loading && !job) return <p className="loading-message">Loading job details...</p>;
    if (!job && actionError && actionError.includes("not found")) return <h2 className="info-message">{actionError}</h2>; // Show fetch error if job failed to load
    if (!job) return <p className="info-message">Job details are unavailable.</p>; // Job not found or other error occurred

    // Determine if chat should be shown based on status and user role
    const shouldShowChat = (job.rawStatus === 1 || job.rawStatus === 2 || job.rawStatus === 5) // Assigned, Awaiting, Disputed
                             && (isEmployer || isAssignedFreelancer);

    // Permissions for buttons
    const isJobOpen = job.rawStatus === 0;
    const isJobAssigned = job.rawStatus === 1;
    // Adjusted canApply check
    const canApply = !!account && !isEmployer && isJobOpen && !!job.isEscrowed;
    const canEscrow = isEmployer && isJobOpen && !job.isEscrowed && !isJobDisputedState;
    const canRelease = isEmployer && isAwaitingApprovalState && !isJobDisputedState;
    const canRaiseDispute = (isEmployer || isAssignedFreelancer) && (isJobAssigned || isAwaitingApprovalState) && !isJobDisputedState;
    const canRefund = isEmployer && isJobOpen && job.isEscrowed && !isJobDisputedState; // Contract checks delay
    const canMarkWorkDone = isAssignedFreelancer && isJobAssigned && !isJobDisputedState;
    const statusColor = getStatusColor(job.status);

    return (
        <div className="job-detail-layout-container">
            {/* --- COLUMN 1: Job Details --- */}
            <div className="job-details-column">
                <h2>{job.title}</h2>

                {/* Optional: Dispute Alert Box */}
                {isJobDisputedState && (
                     <div className="dispute-alert-box" style={{border: '1px solid #dc3545', background: '#f8d7da', color: '#721c24', padding: '10px', borderRadius: '5px', marginBottom: '15px'}}>
                         <strong>Job Disputed!</strong> Please resolve through chat. Actions may be limited.
                     </div>
                )}

                <div className="job-detail-card" style={{ borderLeft: `5px solid ${statusColor}` }}>
                    <div className="job-meta-info">
                        <span className={`job-meta-badge status-${job.status?.toLowerCase().replace('_', '')} ${isJobDisputedState ? 'disputed-pulse' : ''}`}>{job.status}</span>
                        <span className="job-meta-badge budget">{job.budget} ETH</span>
                        <span className={`job-meta-badge escrow-${job.isEscrowed ? 'yes' : 'no'}`}>Escrowed: {job.isEscrowed ? 'Yes' : 'No'}</span>
                    </div>
                    <p><strong>Employer:</strong> {shortenAddress(job.employer)}</p>
                    <p><strong>Freelancer:</strong> {shortenAddress(job.freelancer)}</p>
                    <p><strong>Description:</strong></p>
                    <p className="job-description-text">{job.description || "No description."}</p>

                    <div className="job-actions">
                        {/* --- Conditional Buttons based on Status and Role --- */}

                        {/* Actions for OPEN jobs (not disputed) */}
                        {isJobOpen && !isJobDisputedState && (
                            <>
                                {canApply && <button className="action-button apply" onClick={() => handleAction('APPLY')} disabled={!!actionLoading || !account}>Apply</button>}
                                {canEscrow && <button className="action-button escrow" onClick={() => handleAction('ESCROW')} disabled={!!actionLoading || !account}>Escrow Funds</button>}
                                {canRefund && <button className="action-button refund" onClick={() => handleAction('REFUND')} disabled={!!actionLoading || !account} title="Request refund (requires 7 days post-escrow if still OPEN)">Request Refund</button>}
                            </>
                        )}

                        {/* Actions for ASSIGNED jobs (not disputed) */}
                         {isJobAssigned && !isJobDisputedState && (
                              <>
                                {canMarkWorkDone && <button className="action-button mark-done" onClick={handleMarkWorkDone} disabled={!!actionLoading || !account}>Mark Work Done</button>}
                                {canRaiseDispute && <button className="action-button dispute" onClick={() => handleAction('RAISE_DISPUTE')} disabled={!!actionLoading || !account}>Raise Dispute</button>}
                              </>
                         )}

                         {/* Actions for AWAITING_APPROVAL jobs (not disputed) */}
                         {isAwaitingApprovalState && !isJobDisputedState && (
                              <>
                                {canRelease && <button className="action-button release" onClick={() => handleAction('RELEASE')} disabled={!!actionLoading || !account}>Release Payment</button>}
                                {canRaiseDispute && <button className="action-button dispute" onClick={() => handleAction('RAISE_DISPUTE')} disabled={!!actionLoading || !account}>Raise Dispute</button>}
                              </>
                         )}

                        {/* Placeholder/Info messages for other states or roles */}
                        {isJobDisputedState && (
                             <p className="info-message dispute-info-inline">Actions disabled during dispute. Please use chat.</p>
                        )}
                         {isAwaitingApprovalState && isAssignedFreelancer && !isJobDisputedState && (
                              <p className="info-message approval-info-inline">Work submitted. Waiting for employer's action.</p>
                         )}
                         {/* Add messages for COMPLETED, REFUNDED if needed */}
                         {job.rawStatus === 3 && <p className="info-message final-status-message">Job Completed.</p>}
                         {job.rawStatus === 4 && <p className="info-message final-status-message">Job Refunded.</p>}


                    </div>

                    {/* Status Messages */}
                    {/* Show loading specific to action */}
                    {actionLoading && <p className="loading-message action-loading">Processing {actionLoading.replace('_', ' ')}...</p>}
                    {actionError && <p className="error-message action-error">{actionError}</p>}
                    {actionSuccess && <p className="success-message action-success">{actionSuccess}</p>}
                </div> {/* End Card */}

                <button className="back-button" onClick={() => navigate(-1)} >Back</button>
            </div> {/* End Column 1 */}

            {/* --- COLUMN 2: Chat Area (Live Only) --- */}
            <div className="chat-column">
                {shouldShowChat ? (
                    <div className="live-chat-box">
                        <h3>
                            {isJobDisputedState ? 'Dispute Discussion' : 'Job Chat'}
                            {/* Connection Status Indicator */}
                            {!isChatConnected && <span style={{fontSize: '0.8em', color: '#f39c12', marginLeft: '10px'}}>(Connecting...)</span>}
                        </h3>
                        <div className="chat-messages-area">
                            {/* Display messages */}
                            {chatMessages.length === 0 && isChatConnected && <p className="chat-message system">Live chat connected. Send a message!</p>}
                            {chatMessages.length === 0 && !isChatConnected && <p className="chat-message system">Connecting to live chat...</p>}

                            {chatMessages.map((msg, index) => (
                                // Using index + timestamp for key is slightly more robust if timestamps are unique enough
                                <p key={`${index}-${msg.timestamp}`} className={`chat-message ${msg.sender === 'System' ? 'system' : (msg.sender?.startsWith(shortenAddress(account)) ? 'mine' : 'theirs')}`}>
                                    <strong>{msg.sender}: </strong>{msg.text}
                                    {msg.timestamp && <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                                </p>
                            ))}
                            <div ref={chatEndRef} /> {/* For scrolling */}
                        </div>
                        <div className="chat-input-area">
                            <textarea
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder={isChatConnected ? "Type live message (clears on refresh)..." : "Connecting to chat..."}
                                rows="3"
                                disabled={!account || !isChatConnected || !!actionLoading} // Disable if no account, not connected, or action running
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} // Send on Enter
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!newMessage.trim() || !account || !isChatConnected || !!actionLoading} // Disable if no text, no account, not connected, or action running
                            >
                                Send
                            </button>
                        </div>
                        {/* Note reflecting transient nature */}
                        <p className="info-message chat-backend-note">Note: Chat messages are live only and disappear on page refresh.</p>
                        {!isChatConnected && <p className="error-message chat-backend-note">Chat disconnected. Cannot send/receive messages.</p>}
                    </div>
                ) : (
                    <div className="chat-placeholder">
                         {/* Informative placeholder */}
                         {loading && <p>Loading job details...</p>}
                         {!loading && job && !(job.rawStatus === 1 || job.rawStatus === 2 || job.rawStatus === 5) && <p>Chat only available for Assigned, Awaiting Approval, or Disputed jobs.</p>}
                         {!loading && job && !(isEmployer || isAssignedFreelancer) && <p>Only the Employer and assigned Freelancer can access the chat.</p>}
                         {!loading && !job && <p>Could not load job details.</p>}
                    </div>
                )}
            </div> {/* End Column 2 */}

        </div> // End Layout Container
    );
}

export default JobDetail;