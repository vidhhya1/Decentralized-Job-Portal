import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import './index.css'; // Keep global styles if any
import App from './App';
import { Web3Provider } from './contexts/Web3Context'; // Import Web3Provider

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter> {/* Wrap App with BrowserRouter */}
      <Web3Provider> {/* Wrap App with Web3Provider */}
        <App />
      </Web3Provider>
    </BrowserRouter>
  </React.StrictMode>
);