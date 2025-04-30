
# Decentralized Job Board

A trustless job marketplace built on blockchain technology where employers can post jobs with escrowed payments, and freelancers can apply for jobs. Smart contracts automatically handle fund management and job completion processes.

## Team Members
  - Kadirappagari Brahmisree -230001035
  - Katepalli Gayathri- 230001038
  - Raunak Anand - 230001067
  - Janapareddy Vidya Varshini-230041013
  - Korubilli Vaishnavi-230041016
  - Mullapudi Namaswi-230041023
## Features

- Employers can post jobs with detailed descriptions and budgets
- Employers escrow funds in smart contracts to ensure payment security
- Freelancers can browse and apply for available jobs
- Automatic payment release upon job completion

## Tech Stack

- **Smart Contracts**: Solidity
- **Development Framework**: Truffle
- **Testing Environment**: Ganache
- **Frontend**: React with ethers.js
- **Wallet Connection**: MetaMask

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14.0.0 or later)
- [npm](https://www.npmjs.com/) (v6.0.0 or later)
- [Truffle](https://www.trufflesuite.com/truffle) (`npm install -g truffle`)
- [Ganache](https://www.trufflesuite.com/ganache) - GUI or CLI version
- [MetaMask](https://metamask.io/) browser extension

## Project Structure

```
decentralized-job-board/
├── contracts/              # Smart contracts
│   ├── JobBoard.sol        # Main contract
│   └── Migrations.sol      # Truffle migrations
├── migrations/             # Deployment scripts
├── test/                   # Contract tests
├── client/                 # React frontend
├── truffle-config.js       # Truffle configuration
└── README.md               # This file
```

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/decentralized-job-board.git
cd decentralized-job-board
```

### 2. Install Dependencies

Install the backend dependencies:

```bash
npm install
```

Install the frontend dependencies:

```bash
cd client
npm install
cd ..
```

### 3. Set Up Ganache

#### Option 1: Ganache GUI

1. Open Ganache and create a new workspace
2. Click "Add Project" and select the `truffle-config.js` file from your project
3. Save the workspace

#### Option 2: Ganache CLI

```bash
npx ganache-cli --port 8545 --networkId 1337 --deterministic
```

### 4. Configure MetaMask

1. Install the MetaMask browser extension if you haven't already
2. Create a new wallet or import an existing one
3. Connect MetaMask to your local Ganache blockchain:
   - Click the network dropdown at the top
   - Select "Add Network"
   - Enter the following details:
     - Network Name: Ganache
     - New RPC URL: http://127.0.0.1:8545
     - Chain ID: 1337
     - Currency Symbol: ETH
4. Import an account from Ganache:
   - Copy the private key of one of the accounts in Ganache
   - In MetaMask, click on the account icon > Import Account
   - Paste the private key and click "Import"

### 5. Compile and Deploy Smart Contracts

```bash
truffle compile              # Compile the contracts
truffle migrate --reset      # Deploy to Ganache
```

### 6. Start the Frontend

```bash
cd client
npm start
```

The application should now be running at [http://localhost:3000](http://localhost:3000).

## Using the Application

### As an Employer

1. Connect your MetaMask wallet
2. Navigate to "Post Job" page
3. Fill in the job details and submit
4. Escrow funds when prompted by MetaMask
5. Monitor job applications from the "My Jobs" page
6. Release payment once work is completed

### As a Freelancer

1. Connect your MetaMask wallet
2. Browse available jobs on the "Job Board" page
3. Apply for jobs that match your skills
4. Complete work off-chain
5. Receive automatic payment once the employer confirms completion

## Running Tests

To run the smart contract tests:

```bash
truffle test
```

## Local Job Description Server (Optional)

For storing detailed job descriptions off-chain:

1. Install JSON Server:

```bash
npm install -g json-server
```

2. Start the JSON Server:

```bash
json-server --watch db.json --port 3001
```

The server will be available at [http://localhost:3001](http://localhost:3001).

## Troubleshooting

### Contract Deployment Issues

- Ensure Ganache is running before deploying contracts
- Check that your Truffle network configuration matches your Ganache settings
- If you receive "out of gas" errors, increase the gas limit in `truffle-config.js`

### MetaMask Connection Issues

- Make sure the network ID in MetaMask matches your Ganache network ID
- Reset your MetaMask account (Settings > Advanced > Reset Account) if transactions are stuck

### Transaction Failures

- Check the transaction logs in your browser console
- Ensure you have enough ETH in your account for gas costs
- Verify that you're using the correct account for the operation

## Gas Optimization Tips

- Batch operations when possible to reduce gas costs
- Use appropriate data types (uint256 for ETH values)
- Minimize on-chain storage for large data

## Security Considerations

- The smart contract uses checks-effects-interactions pattern to prevent reentrancy attacks
- Only essential data is stored on-chain for privacy and cost efficiency
- Critical functions have role-based access controls

## License

This project is licensed under the MIT License - see the LICENSE file for details.
