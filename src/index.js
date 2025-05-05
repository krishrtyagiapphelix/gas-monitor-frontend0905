// import React from 'react';
// import ReactDOM from 'react-dom';
// import App from './App';
// import { AuthProvider } from './context/AuthContext';

// ReactDOM.render(
//   <AuthProvider>
//     <App />
//   </AuthProvider>,
//   document.getElementById('root')
// );

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);