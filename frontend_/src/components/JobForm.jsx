// src/components/JobForm.jsx
import React, { useState } from 'react';
// Assuming you are using ethers v6 based on contract.target and parseEther
import { parseEther, isAddress } from 'ethers';
import { useNavigate } from 'react-router-dom';
// Make sure this hook name matches your Web3 context file
import { useWeb3Context } from '../contexts/Web3Context';
import './JobForm.css'; // Import the CSS file you created

// --- IMPORTANT: Securely manage your Pinata keys! ---
// --- Ensure REACT_APP_PINATA_JWT is set in your .env file ---
// --- Add .env to your .gitignore file ---
const PINATA_JWT = process.env.REACT_APP_PINATA_JWT;
console.log("PINATA_JWT from env:", PINATA_JWT ? "Loaded (partially hidden)" : "MISSING or empty"); // Log check for JWT

// Helper function (can be moved to a utils file if used elsewhere)
const shortenAddress = (address) => {
    if (!address || typeof address !== 'string') return '';
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};


function JobForm() {
    // Assuming your context provides these based on your code:
    const { contract, account, provider, signer, setError } = useWeb3Context(); // Added provider for network check potentially
    const navigate = useNavigate();

    // --- Component State ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState(''); // Keep as string for input field
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Updated status messages to reflect IPFS step
    const [txStatus, setTxStatus] = useState(''); // e.g., Uploading, Processing, Waiting, Success, Failed
    const [txHash, setTxHash] = useState(''); // To store transaction hash for linking
    const [localError, setLocalError] = useState(''); // For form validation or specific errors

    // --- ADDED: Function to upload JSON data (containing the description) to Pinata ---
    const uploadToPinata = async (dataToPin) => {
        if (!PINATA_JWT) {
            console.error("Pinata JWT is missing. Ensure REACT_APP_PINATA_JWT is set in your .env file and you restarted the dev server.");
            throw new Error("IPFS configuration error. Cannot upload description.");
        }
        // Update status for user
        setTxStatus('Uploading description to IPFS via Pinata...');
        try {
            const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PINATA_JWT}` // Use JWT for auth
                },
                body: JSON.stringify({
                    pinataMetadata: { // Optional: Add metadata
                        name: `JobDesc_${title.trim().substring(0, 20).replace(/\s+/g, '_')}_${Date.now()}`,
                        // keyvalues: { app: 'JobBoardDApp' } // Example custom key-value
                    },
                    pinataContent: dataToPin // Pinata expects the content here
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { reason: "Unknown Pinata API error" } })); // Handle non-json errors
                console.error("Pinata API Error Response:", errorData);
                throw new Error(`Pinata API Error (${response.status}): ${errorData.error?.reason || response.statusText}`);
            }

            const result = await response.json();
            console.log("Pinata upload result:", result);
            if (!result.IpfsHash) {
                throw new Error("IPFS Hash (CID) not found in Pinata response.");
            }
            setTxStatus('Description uploaded successfully! Preparing transaction...');
            return result.IpfsHash; // This is the CID

        } catch (error) {
            console.error("IPFS Upload Error:", error);
            // Rethrow error to be caught by handleSubmit
            throw new Error(`Failed to upload description to IPFS: ${error.message}`);
        }
    };
    // --- END: IPFS Upload Function ---


    // --- Event Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        // Reset status on new submission
        if (setError) setError('');
        setLocalError('');
        setTxStatus('');
        setTxHash('');
        setIsSubmitting(true);

        // 1. Pre-flight Checks (Wallet, Contract, Network - kept as is)
        if (!account || !signer) { setLocalError("Wallet is not connected. Please connect your wallet."); setIsSubmitting(false); return; }
        if (!contract || !contract.target || !isAddress(contract.target)) { setLocalError("Contract not loaded properly. Please ensure connection and refresh."); setIsSubmitting(false); return; }
        // Optional Network Check can remain here

        // Basic Input Validation (kept as is)
        if (!title.trim() || !description.trim() || !budget.trim()) { setLocalError("Please fill in all fields (Title, Description, Budget)."); setIsSubmitting(false); return; }

        // Validate and convert budget (kept as is)
        let budgetInWei;
        try {
            budgetInWei = parseEther(budget);
            if (budgetInWei <= 0n) { throw new Error("Budget must be a positive amount."); }
        } catch (parseError) { console.error("Budget parsing error:", parseError); setLocalError(`Invalid budget format. Please enter a valid number (e.g., 0.5).`); setIsSubmitting(false); return; }

        // --- Transaction Logic with IPFS ---
        let transactionHash = '';
        let descriptionCID = ''; // Variable to hold CID

        try {
            // <<< Step 2: Upload Description to IPFS >>>
            const descriptionJson = {
                 description: description.trim()
                 // Add other metadata if needed, e.g., timestamp: Date.now()
            };
            descriptionCID = await uploadToPinata(descriptionJson); // Status updates happen inside

            // <<< Step 3: Prepare and Send Blockchain Transaction >>>
            setTxStatus('Please confirm transaction in your wallet...'); // Update status after successful upload
            const txContract = contract.connect(signer);

            console.log(`Sending postJob transaction: Title=${title.trim()}, DescriptionCID=${descriptionCID}, Budget=${budgetInWei.toString()} Wei`);

            // <<< MODIFIED: Call postJob with CID >>>
            // Make sure the contract instance has the updated ABI
            const tx = await txContract.postJob(
                title.trim(),
                descriptionCID, // Pass the CID obtained from IPFS
                budgetInWei
            );

            // --- Process Transaction (steps 4 onwards are largely the same) ---
            transactionHash = tx.hash;
            setTxHash(transactionHash);
            setTxStatus('Transaction submitted, waiting for confirmation...');
            console.log("Transaction submitted:", transactionHash);

            const receipt = await tx.wait(1);
            console.log("Transaction confirmed:", receipt);

            setTxStatus('Job Posted Successfully!');

            // --- Process Receipt for Job ID (ensure ABI is updated in context) ---
            let newJobId = null;
             if (receipt?.logs) {
                 try {
                     const jobBoardInterface = contract.interface; // Uses ABI from context
                     // This relies on the Event signature matching exactly in the ABI
                     const jobPostedTopic = jobBoardInterface.getEvent("JobPosted").topicHash;
                     const contractAddress = contract.target.toLowerCase();
                     const eventLog = receipt.logs.find(log =>
                         log.address.toLowerCase() === contractAddress &&
                         log.topics[0] === jobPostedTopic
                     );
                     if (eventLog) {
                         const parsedLog = jobBoardInterface.parseLog({ topics: [...eventLog.topics], data: eventLog.data });
                         if (parsedLog?.args?.jobId !== undefined) {
                             newJobId = parsedLog.args.jobId.toString();
                             console.log("New Job ID found:", newJobId);
                             console.log("Desc CID from event:", parsedLog?.args?.descriptionCID);
                         } else { console.warn("Could not parse JobPosted event args:", eventLog); }
                     } else { console.warn("JobPosted event log not found."); }
                 } catch (eventError) { console.error("Error parsing JobPosted event:", eventError); }
             } else { console.warn("Receipt missing logs."); }

            // --- Navigate on Success ---
            setTimeout(() => {
                setTitle(''); setDescription(''); setBudget('');
                setTxStatus(''); setTxHash('');
                if (newJobId) { navigate(`/job/${newJobId}`); }
                else { console.warn("Navigating to dashboard as Job ID unknown."); navigate('/dashboard/employer'); }
            }, 3000);

        } catch (err) {
             // --- Error Handling (catches errors from IPFS upload or blockchain tx) ---
             console.error("Job Posting Process Error:", err);
             let message = err.message || "An unknown error occurred."; // Start with the error's message
             const finalTxHash = err.transactionHash || transactionHash || txHash; // Preserve hash if available
             if (finalTxHash) setTxHash(finalTxHash);

             if (err.code === 'ACTION_REJECTED') {
                 message = "Transaction rejected in wallet.";
                 setTxStatus(''); // Clear processing message
             } else if (message.includes("IPFS configuration error") || message.includes("upload description to IPFS") || message.includes("Pinata API Error")) {
                 // Specific error from our IPFS upload function or config
                 setTxStatus('IPFS Upload Failed.');
             } else {
                 // Try to extract blockchain revert reason
                 message = err.reason || err.data?.message || message;
                 setTxStatus('Transaction Failed.');
             }
             // Display concise error message
             setLocalError(`Error: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);
              // Optional: Clear error status after delay if needed
             // setTimeout(() => setTxStatus(''), 7000);

        } finally {
            setIsSubmitting(false); // Always reset submitting state
        }
    };

    // Helper to build Etherscan link (kept as is)
    const getEtherscanLink = (hash) => `https://sepolia.etherscan.io/tx/${hash}`; // TODO: Make dynamic

    // --- Render Logic ---
    if (!account) {
        return <p className="info-message">Please connect your wallet to post a job.</p>;
    }

    return (
        <div className="form-container job-form-container">
            <h2>Post a New Job</h2>
            <form onSubmit={handleSubmit} className="job-form">
                {/* Title Input (Unchanged UI) */}
                <div className="form-group">
                     <label htmlFor="title">Job Title:</label>
                     <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isSubmitting} maxLength={100} placeholder="e.g., Develop NFT Marketplace Frontend" />
                </div>

                {/* Description Textarea (UI unchanged) */}
                <div className="form-group">
                     <label htmlFor="description">Description:</label>
                     <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isSubmitting} rows={5} maxLength={5000} // Increased max length
                         placeholder="Describe the job requirements, tech stack, deliverables, timeline, etc." />
                     {/* MODIFIED Help Text */}
                     <small>Description will be stored on IPFS.</small>
                </div>

                {/* Budget Input (Unchanged UI) */}
                <div className="form-group">
                     <label htmlFor="budget">Budget (ETH):</label>
                     <input id="budget" type="number" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} required min="0.000000000000000001" disabled={isSubmitting} placeholder="e.g., 1.5" />
                </div>

                {/* Submit Button (Unchanged UI) */}
                <button type="submit" className="submit-button" disabled={isSubmitting || !account}>
                     {isSubmitting ? (txStatus || 'Processing...') : 'Post Job'}
                </button>

                {/* Status Display (Unchanged UI) */}
                 {txStatus && !localError && !txStatus.includes('Failed') && (
                     <p className={`tx-status ${txStatus.includes('Successfully') ? 'success' : 'info'}`}>
                         {txStatus}
                         {txHash && ( <>{' '} <a href={getEtherscanLink(txHash)} target="_blank" rel="noopener noreferrer" title="View transaction on block explorer">View Transaction</a> </> )}
                     </p>
                 )}

                 {/* Error Display (Unchanged UI) */}
                 {localError && (
                     <p className="error-message">
                         {localError}
                         {txHash && txStatus === 'Transaction Failed.' && ( <>{' '} <a href={getEtherscanLink(txHash)} target="_blank" rel="noopener noreferrer" title="View failed transaction on block explorer">View Failed Tx</a> </> )}
                     </p>
                 )}
            </form>
        </div>
    );
}

export default JobForm;