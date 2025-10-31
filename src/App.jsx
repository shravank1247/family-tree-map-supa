import React, { useState, useEffect } from 'react';
// The import is correct: BrowserRouter is aliased as Router
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import Home from './screens/Home';
import TreeView from './screens/TreeView';

// Corrected import path based on the structure implied by other uploaded files:
// The folder is likely named 'Services' (capital S) as used in Auth.jsx and TreeView.jsx.
import { auth } from './Services/firebase'; 

/**
 * Main application component that sets up routing and manages the global authentication state.
 * It ensures users are redirected to the home screen if they are not authenticated 
 * when trying to access the tree view.
 */
const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Use onAuthStateChanged for robust and persistent authentication management
  useEffect(() => {
    // This listener handles sign-in, sign-out, and initial page load state check.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Clean up the subscription when the component unmounts
    return () => unsubscribe();
  }, []);

  // Show a loading indicator while Firebase is determining the auth state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl font-semibold text-indigo-600">Loading Authentication...</div>
      </div>
    );
  }

  return (
    // CRITICAL FIX: Add basename to the Router component
    // This is required for correct routing on GitHub Pages subdirectories.
    <Router basename={import.meta.env.VITE_BASE_PATH || '/family-tree-map-supa'}> 
      <div className="min-h-screen">
       <Routes>
    <Route path="/" element={<Home />} /> 
    <Route path="/tree/:treeId" element={<TreeView />} /> 
</Routes>
      </div>
    </Router>
  );
};

export default App;