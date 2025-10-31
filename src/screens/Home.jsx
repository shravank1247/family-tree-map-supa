// src/screens/Home.jsx

import React, { useState, useEffect, useCallback } from "react";
import Auth from "../components/Auth";
import { Link, useNavigate } from "react-router-dom";
// CRITICAL: Import all necessary Firebase functions
import { auth, getAllTreeIds, saveTreeToFirestore, deleteTree } from '../Services/firebase'; 

const DEFAULT_TREE_ID = "My_First_Tree";

const Home = () => {
  const navigate = useNavigate();
  // Initialize user from auth object
  const [user, setUser] = useState(auth.currentUser); 
  const [treeIds, setTreeIds] = useState([]);
  const [newSurname, setNewSurname] = useState('');
  const [loading, setLoading] = useState(true);

  // Use a listener to handle the user state correctly after redirects or on initial load
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
        setUser(currentUser);
        if (currentUser) {
            // User is logged in, now fetch trees
            fetchTreeIds(currentUser);
        } else {
            setLoading(false); // No user, stop loading state
            setTreeIds([]);
        }
    });
    return () => unsubscribe();
  }, []); 

  const fetchTreeIds = useCallback(async (currentUser) => {
    if (!currentUser) return;
    setLoading(true);
    try {
        const ids = await getAllTreeIds();
        if (ids.length === 0) {
            // Automatically create a default tree if none exist
            await createDefaultTree(DEFAULT_TREE_ID);
            setTreeIds([DEFAULT_TREE_ID]);
        } else {
            setTreeIds(ids);
        }
    } catch (error) {
        console.error("Failed to fetch tree IDs:", error);
    } finally {
        setLoading(false);
    }
  }, []);
  
  // Utility function to create the default tree
  const createDefaultTree = async (treeId) => {
    // 1. Create a root node for the new tree
    const initialNode = {
        id: 'root_' + Date.now(),
        type: 'customNode',
        position: { x: 250, y: 50 },
        // CRITICAL FIX: Explicitly set all data fields to a safe value (like '') 
        // to avoid any field being 'undefined' during the first save.
        data: {
            label: `${treeId} Family Root`,
            familyName: treeId,
            dob: '', // Safe value
            anniversary: '', // Safe value
            tags: 'Root, Living',
            notes: 'Start building your tree here',
            image: '', // Safe value
            collapsed: false,
        },
    };
    
    // Save the initial state to Firestore
    // We only need to save the serializable parts of the node
    const cleanedNodes = [{
        id: initialNode.id,
        type: initialNode.type,
        position: initialNode.position,
        data: initialNode.data, // This data is already clean
    }];
    
    // Save a minimal tree structure to Firestore
    await saveTreeToFirestore(cleanedNodes, [], treeId);
  }

  // CRITICAL: Function to handle creating a new tree surname
  const handleCreateTree = useCallback(async () => {
    if (!user || !newSurname.trim()) return;
    const treeId = newSurname.trim().replace(/\s/g, '_'); // Replace spaces for URL/ID

    if (treeIds.includes(treeId)) {
        alert(`A family tree named '${treeId}' already exists.`);
        return;
    }
    
    try {
        setLoading(true);

        // This function encapsulates the node creation and save logic
        await createDefaultTree(treeId); 
        
        // 3. Update the list and navigate
        setNewSurname('');
        await fetchTreeIds(user);
        navigate(`/tree/${treeId}`);

    } catch (error) {
        console.error('Failed to create tree:', error);
        // The error message from Firebase is now shown to the user
        alert(`Failed to create tree: ${error.message}`);
    } finally {
        setLoading(false);
    }
  }, [user, newSurname, fetchTreeIds, navigate, treeIds]);

  const handleDeleteTree = async (treeId) => {
    if (window.confirm(`Are you sure you want to delete the '${treeId}' family tree? This cannot be undone.`)) {
        try {
            await deleteTree(treeId);
            fetchTreeIds(user);
        } catch (error) {
            alert(`Error deleting tree: ${error.message}`);
        }
    }
  };


  if (!user) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
            <h1 className="text-4xl font-bold text-blue-600 mb-6">Family Tree Map</h1>
            <p className="mb-8 text-lg text-gray-600">Please sign in to manage your family trees.</p>
            <Auth onLogin={setUser} />
        </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Your Family Trees</h1>
      
      <div className="w-full max-w-lg bg-white p-6 rounded-xl shadow-lg">
        <div className="mb-6 flex justify-center">
            <Auth onLogin={setUser} /> 
        </div>

        {/* Create New Tree Form */}
        <div className="mb-8 p-4 border border-gray-200 rounded-lg">
            <h2 className="text-xl font-semibold text-gray-700 mb-3">Create New Family Tree</h2>
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Enter Family Surname (e.g., Aitha, Smith)"
                    value={newSurname}
                    onChange={(e) => setNewSurname(e.target.value)}
                    className="flex-1 border p-2 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                />
                <button
                    onClick={handleCreateTree}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400"
                    disabled={!newSurname.trim() || loading}
                >
                    Create Tree
                </button>
            </div>
        </div>

        {/* Existing Trees List */}
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Existing Trees ({treeIds.length})</h2>
        {loading ? (
            <p className="text-center text-gray-500">Loading trees...</p>
        ) : treeIds.length === 0 ? (
            <p className="text-center text-gray-500">No trees found. Create a new one above!</p>
        ) : (
            <ul className="space-y-3">
                {treeIds.map((id) => (
                    <li key={id} className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg hover:shadow-md transition-shadow">
                        <Link
                            to={`/tree/${id}`}
                            className="text-lg font-medium text-blue-600 hover:text-blue-800 flex-1 truncate"
                        >
                            {id} Family Tree
                        </Link>
                        <div className="flex gap-2">
                            <button
                                onClick={() => navigate(`/tree/${id}`)}
                                className="bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600 transition-colors"
                            >
                                Open Map
                            </button>
                            {/* Allow deletion only if it's not the last tree */}
                            {treeIds.length > 1 ? (
                                <button
                                    onClick={() => handleDeleteTree(id)}
                                    className="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600 transition-colors"
                                >
                                    Delete
                                </button>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ul>
        )}
      </div>
    </div>
  );
};

export default Home;