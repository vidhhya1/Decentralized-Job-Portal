// src/contexts/Web3Context.js
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { BrowserProvider, Contract } from 'ethers'; // Ethers v6 imports
import JobBoardArtifact from '../artifacts/JobBoard.json';
import { JOB_BOARD_CONTRACT_ADDRESS } from '../config'; // Only import address
import { useNavigate } from 'react-router-dom';

const Web3Context = createContext(null);

export const useWeb3Context = () => useContext(Web3Context);

export const Web3Provider = ({ children }) => {
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [account, setAccount] = useState(null);
    const [contract, setContract] = useState(null);
    const [network, setNetwork] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // New state for user role
    const [userRole, setUserRole] = useState(null);
    
    const navigate = useNavigate(); // For navigation after connection

    const clearState = useCallback(() => {
        setProvider(null);
        setSigner(null);
        setAccount(null);
        setContract(null);
        setNetwork(null);
        setError('');
        setIsLoading(false);
        setUserRole(null); // Clear user role when state is cleared
    }, []);

    const connectWallet = useCallback(async () => {
        setError('');
        setIsLoading(true);
        try {
            if (!window.ethereum) {
                throw new Error("MetaMask (or another Ethereum wallet) is not installed.");
            }

            const web3Provider = new BrowserProvider(window.ethereum, "any");
            await web3Provider.send("eth_requestAccounts", []);

            const currentSigner = await web3Provider.getSigner();
            const currentAccount = await currentSigner.getAddress();
            const currentNetwork = await web3Provider.getNetwork();

            setProvider(web3Provider);
            setSigner(currentSigner);
            setAccount(currentAccount);
            setNetwork(currentNetwork);

            const jobBoardContract = new Contract(
                JOB_BOARD_CONTRACT_ADDRESS,
                JobBoardArtifact.abi,
                currentSigner
            );
            setContract(jobBoardContract);
            console.log("Wallet Connected:", currentAccount, "Network:", currentNetwork.name);
            
            // Navigate to welcome page after successful connection if role is set
            if (userRole) {
                navigate('/welcome');
            }

        } catch (err) {
            console.error("Connection Error:", err);
            setError(err.message || 'Failed to connect wallet.');
            clearState(); // Clear state fully on error now
        } finally {
            setIsLoading(false);
        }
    }, [clearState, navigate, userRole]);

    // Handle account/network changes
    useEffect(() => {
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                console.log("Account changed:", accounts);
                if (accounts.length === 0) {
                    clearState();
                    setError('Wallet disconnected. Please connect again.');
                } else if (!account || accounts[0].toLowerCase() !== account.toLowerCase()) {
                    connectWallet();
                }
            };

            const handleChainChanged = (_chainId) => {
                console.log("Network changed:", _chainId);
                // Reconnect to update network state and contract instance
                connectWallet();
            };

            const handleDisconnect = (providerError) => {
                console.log("Wallet disconnected by provider", providerError);
                clearState();
                setError('Wallet disconnected.');
            };

            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
            window.ethereum.on('disconnect', handleDisconnect);

            return () => {
                if (window.ethereum.removeListener) {
                    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                    window.ethereum.removeListener('chainChanged', handleChainChanged);
                    window.ethereum.removeListener('disconnect', handleDisconnect);
                }
            };
        }
    }, [account, connectWallet, clearState]);

    // Disconnect wallet function
    const disconnectWallet = useCallback(() => {
        clearState();
        navigate('/');
    }, [clearState, navigate]);

    const value = {
        provider,
        signer,
        account,
        contract,
        network,
        isLoading,
        error,
        connectWallet,
        disconnectWallet, // Add disconnect function
        setError,
        userRole,
        setUserRole // Add user role state
    };

    return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};