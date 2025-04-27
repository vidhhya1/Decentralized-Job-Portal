// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract JobBoard is ReentrancyGuard, Ownable {

    // Added DELETED status, keep others
    enum JobStatus { OPEN, ASSIGNED, AWAITING_APPROVAL, COMPLETED, REFUNDED, DISPUTED, DELETED }

    struct Job {
        uint256 id;
        string title;
        string descriptionCID;  // IPFS CID for the detailed description
        uint256 budget;
        address payable employer;
        // Freelancer is set only when assigned by employer
        address payable freelancer;
        JobStatus status;
        uint256 escrowTime;
    }

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;
    mapping(uint256 => uint256) public escrowedFunds;

    // Using 1 minute delay as requested previously
    uint256 public constant REFUND_DELAY = 1 minutes;

    // --- Events ---
    event JobPosted(uint256 indexed jobId, address indexed employer, string title, uint256 budget, string descriptionCID);
    // <<< RENAMED: JobApplied to JobAssigned for clarity >>>
    event JobAssigned(uint256 indexed jobId, address indexed freelancer);
    // <<< ADDED: Event for tracking applications >>>
    event ApplicationSubmitted(uint256 indexed jobId, address indexed applicant, string applicationCID);
    event PaymentEscrowed(uint256 indexed jobId, address indexed employer, uint256 amount);
    event PaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 amount);
    event EmployerRefunded(uint256 indexed jobId, address indexed employer, uint256 amount);
    event DisputeRaised(uint256 indexed jobId, address indexed initiator);
    event DisputeResolved(uint256 indexed jobId, address indexed admin, address indexed winner, uint256 amount);
    event WorkSubmitted(uint256 indexed jobId, address indexed freelancer);
    event JobDeleted(uint256 indexed jobId);
    event ApplicationWithdrawn(uint256 indexed jobId, address indexed freelancer);


    // --- Modifiers ---
    modifier onlyEmployer(uint256 _jobId) { /* ... unchanged ... */ }
    modifier onlyFreelancer(uint256 _jobId) { /* ... unchanged ... */ }
    modifier jobExists(uint256 _jobId) { /* ... unchanged ... */ }
    constructor() Ownable(msg.sender) {}

    // --- Core Functions ---

    function postJob( /* ... unchanged ... */
        string memory _title,
        string memory _descriptionCID,
        uint256 _budget
    ) public {
        // ... (validation as before) ...
        require(bytes(_title).length > 0, "JobBoard: Title cannot be empty");
        require(bytes(_descriptionCID).length > 0, "JobBoard: Description CID cannot be empty");
        require(_budget > 0, "JobBoard: Budget must be greater than 0");

        jobCount++;
        uint256 currentJobId = jobCount;
        jobs[currentJobId] = Job({
            id: currentJobId, title: _title, descriptionCID: _descriptionCID,
            budget: _budget, employer: payable(msg.sender), freelancer: payable(address(0)),
            status: JobStatus.OPEN, escrowTime: 0
        });
        emit JobPosted(currentJobId, msg.sender, _title, _budget, _descriptionCID);
    }

    function escrowFunds(uint256 _jobId) public payable jobExists(_jobId) onlyEmployer(_jobId) { /* ... unchanged ... */ }

    // <<< REMOVED: Old applyForJob function >>>
    // function applyForJob(uint256 _jobId) public jobExists(_jobId) { ... }

    // <<< ADDED: Function for freelancers to submit applications >>>
    /**
     * @notice Allows any potential freelancer to submit their application details (via IPFS CID).
     * @dev Emits an event linking the applicant and their application CID to the job.
     * @param _jobId The ID of the job to apply for.
     * @param _applicationCID The IPFS CID pointing to the freelancer's application details.
     */
    function submitApplication(uint256 _jobId, string memory _applicationCID) public jobExists(_jobId) {
        Job storage job = jobs[_jobId];

        // Checks
        require(job.status == JobStatus.OPEN, "JobBoard: Job is not open for applications");
        require(escrowedFunds[_jobId] == job.budget, "JobBoard: Funds not escrowed by employer yet");
        require(msg.sender != job.employer, "JobBoard: Employer cannot apply");
        require(bytes(_applicationCID).length > 0, "JobBoard: Application CID cannot be empty");
        // Note: We don't prevent multiple applications from the same address here,
        // the frontend/employer can filter if needed based on events.

        // Interaction: Emit event to signal application
        emit ApplicationSubmitted(_jobId, msg.sender, _applicationCID);
    }

    // <<< ADDED: Function for the employer to assign a chosen freelancer >>>
    /**
     * @notice Allows the employer to assign a specific freelancer to an open, escrowed job.
     * @dev Sets the freelancer address and updates the job status to ASSIGNED.
     * @param _jobId The ID of the job to assign.
     * @param _freelancer The address of the freelancer being assigned.
     */
    function assignJob(uint256 _jobId, address payable _freelancer) public jobExists(_jobId) onlyEmployer(_jobId) {
        Job storage job = jobs[_jobId];

        // Checks
        require(job.status == JobStatus.OPEN, "JobBoard: Job must be OPEN to assign a freelancer");
        require(job.freelancer == address(0), "JobBoard: Job already has a freelancer assigned"); // Sanity check
        require(escrowedFunds[_jobId] == job.budget, "JobBoard: Funds must be escrowed before assigning");
        require(_freelancer != address(0), "JobBoard: Cannot assign zero address");
        require(_freelancer != job.employer, "JobBoard: Cannot assign employer as freelancer");
        // Note: We don't enforce here that '_freelancer' must have submitted an application via event.
        // This relies on the employer's off-chain verification.

        // Effects
        job.freelancer = _freelancer;
        job.status = JobStatus.ASSIGNED;

        // Interaction
        emit JobAssigned(_jobId, _freelancer); // Use renamed event
    }


    function markWorkDone(uint256 _jobId) public jobExists(_jobId) onlyFreelancer(_jobId) nonReentrant { /* ... unchanged ... */ }

    function releasePayment(uint256 _jobId) public jobExists(_jobId) onlyEmployer(_jobId) nonReentrant { /* ... unchanged ... */ }

    function refundEmployer(uint256 _jobId) public jobExists(_jobId) onlyEmployer(_jobId) nonReentrant { /* ... unchanged, uses 1 min delay ... */ }

    function deleteJob(uint256 _jobId) public onlyEmployer(_jobId) nonReentrant { // Removed jobExists here to check status *before* potentially failing on DELETED check
        // We need jobExists logic but tailored for deletion
        require(_jobId > 0 && _jobId <= jobCount, "JobBoard: Job does not exist");
        Job storage job = jobs[_jobId];
        uint256 amount = escrowedFunds[_jobId];

        // Can only delete OPEN jobs
        require(job.status == JobStatus.OPEN, "JobBoard: Can only delete OPEN jobs");

        // Refund escrow if present
        if (amount > 0) {
            escrowedFunds[_jobId] = 0;
            (bool success, ) = job.employer.call{value: amount}("");
            require(success, "JobBoard: Refund during delete failed");
            emit EmployerRefunded(_jobId, job.employer, amount);
        }

        job.status = JobStatus.DELETED; // Mark as deleted
        emit JobDeleted(_jobId);
    }

    function withdrawApplication(uint256 _jobId) public jobExists(_jobId) onlyFreelancer(_jobId) nonReentrant { /* ... unchanged ... */ }

    function raiseDispute(uint256 _jobId) public jobExists(_jobId) { /* ... unchanged ... */ }

    function resolveDispute(uint256 _jobId, bool _awardToFreelancer) public onlyOwner nonReentrant { /* ... unchanged ... */ }

    // --- View Functions ---
    function getJobCount() public view returns (uint256) { /* ... unchanged ... */ }
    function getJob(uint256 _jobId) public view jobExists(_jobId) returns (Job memory) { /* ... unchanged ... */ }
    function getEscrowAmount(uint256 _jobId) public view jobExists(_jobId) returns (uint256) { /* ... unchanged ... */ }
}