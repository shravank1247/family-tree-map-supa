// src/Services/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, query } from "firebase/firestore";

// --- START: Firebase Initialization using Global Config ---
// The Canvas environment provides configuration via the __firebase_config global variable.
let firebaseConfig;

try {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    firebaseConfig = JSON.parse(__firebase_config);
  } else {
    console.warn("Using VITE environment variables for Firebase config. Ensure .env file is loaded.");
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };

    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_API_KEY")) {
      console.error("FIREBASE ERROR: API Key is missing or invalid. Please check your .env file.");
    }
  }
} catch (e) {
  console.error("Failed to load Firebase configuration:", e);
  firebaseConfig = {};
}

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Authentication and Firestore
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Helper to get the user's family_trees collection reference
const getUserTreesCollectionRef = (userId) => {
    // const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    // return collection(db, 'artifacts', appId, 'users', userId, 'family_trees');
return collection(db, 'shared_trees')

};


// Used by getAllTreeIds and deleteTree
const getTreeDocRef = (treeId) => {
    return doc(getGlobalTreesCollectionRef(), treeId);
};

/**
 * Saves the tree structure (nodes and edges) to Firestore.
 * @param {Array} nodes - The array of node objects.
 * @param {Array} edges - The array of edge objects.
 * @param {string} treeId - The unique ID for the tree (e.g., family surname).
 */
export const saveTreeToFirestore = async (nodes, edges, treeId) => {
  try {
    const userId = auth.currentUser?.uid;

    if (!userId) {
      console.log("Save Error: No authenticated user found.");
      return;
    }
    
    // CRITICAL PATH FIX: Use treeId as the document ID in the 'family_trees' collection
    const treeRef = doc(getUserTreesCollectionRef(userId), treeId); 

    await setDoc(treeRef, {
      nodes: nodes,
      edges: edges,
      lastUpdated: new Date().toISOString(),
    });

    console.log("Tree saved successfully to Firestore:", treeId);
  } catch (error) {
    console.error("Error saving tree:", error);
    // Re-throw the error so the calling component can handle the UI feedback
    throw error; 
  }
};

/**
 * Loads the tree structure (nodes and edges) from Firestore for the current user.
 * @param {string} treeId - The unique ID for the tree (e.g., family surname).
 * @returns {Object} An object containing the nodes and edges array.
 */
export const loadTreeFromFirestore = async (treeId) => {
  try {
    const userId = auth.currentUser?.uid;

    if (!userId) {
      console.log("Load Error: No authenticated user found.");
      return { nodes: [], edges: [] };
    }

    // CRITICAL PATH FIX: Use treeId as the document ID
    const treeRef = doc(getUserTreesCollectionRef(userId), treeId);
    const treeDoc = await getDoc(treeRef);

    if (treeDoc.exists()) {
      const data = treeDoc.data();
      console.log("Tree loaded successfully from Firestore:", treeId);
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
      };
    } else {
      console.log("No existing tree found for this user in Firestore:", treeId);
      return { nodes: [], edges: [] };
    }
  } catch (error) {
    console.error("Error loading tree:", error);
    return { nodes: [], edges: [] };
  }
};

/**
 * Retrieves a list of all tree IDs (surnames) for the current user.
 * @returns {Array<string>} An array of tree IDs.
 */
export const getAllTreeIds = async () => {
    try {
        const userId = auth.currentUser?.uid;
        if (!userId) {
            console.log("Retrieve Tree IDs Error: No authenticated user found.");
            return [];
        }

        const treesRef = getUserTreesCollectionRef(userId);
        const q = query(treesRef);
        const querySnapshot = await getDocs(q);

        const treeIds = [];
        querySnapshot.forEach((doc) => {
            treeIds.push(doc.id); // doc.id is the treeId (surname)
        });
        
        return treeIds;
    } catch (error) {
        console.error("Error retrieving tree IDs:", error);
        return [];
    }
};

/**
 * Deletes a specific family tree.
 * @param {string} treeId - The unique ID of the tree to delete.
 */
export const deleteTree = async (treeId) => {
    try {
        const userId = auth.currentUser?.uid;
        if (!userId) {
            throw new Error("User not authenticated.");
        }

        const treeRef = doc(getUserTreesCollectionRef(userId), treeId);
        await deleteDoc(treeRef);
        
        console.log(`Tree '${treeId}' successfully deleted.`);
    } catch (error) {
        console.error("Error deleting tree:", error);
        throw error;
    }
};

// Export all major components
export * from "firebase/auth";
export * from "firebase/firestore";