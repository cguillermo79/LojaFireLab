import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ProveedorEstado } from './estado.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<ProveedorEstado><App /></ProveedorEstado>);
