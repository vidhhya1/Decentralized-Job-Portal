// src/components/ConnectWallet.jsx
import React from 'react';
import './ConnectWallet.css'; // Import the CSS file

function ConnectWallet({ account, connectWallet, loading, network }) {
    return (
        <div className="connect-wallet"> {/* Use className */}
            {account ? (
                <div className="wallet-info"> {/* Use className */}
                    {network?.name && <span className="network-name">{network.name}</span>} {/* Use className */}
                    <span className="account-address" title={account}> {/* Use className */}
                        {account.substring(0, 6)}...{account.substring(account.length - 4)}
                    </span>
                </div>
            ) : (
                <button className="connect-button" onClick={connectWallet} disabled={loading}> {/* Use className */}
                    {loading ? 'Connecting...' : 'Connect Wallet'}
                </button>
            )}
        </div>
    );
}

export default ConnectWallet;