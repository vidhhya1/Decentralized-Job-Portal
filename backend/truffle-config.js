module.exports = {
  networks: {
    // Development network (Ganache)
    ganache: {
      host: "127.0.0.1",     // Localhost (default: none)
      port: 8545 ,            // Standard Ganache UI port
      network_id: "*",       // Any network (default: none)
    },
    // Add other networks like Sepolia, Mainnet etc. if needed
  },

  // Set default mocha options here, use special reporters, etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.21", // Fetch exact version from solc-bin (default: truffle's version)
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,   // Enable optimizer for gas savings
          runs: 200
        },
        // evmVersion: "byzantium" // Specify EVM version if needed
      }
    }
  }
};