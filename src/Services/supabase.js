// src/Services/supabase.js

import { createClient } from "@supabase/supabase-js";

// --- START: Supabase Initialization using Global Config ---
let supabaseConfig;
let apiKey;


try {
  // CRITICAL: Load config from the environment's global variable
  if (typeof __supabase_config !== 'undefined' && __supabase_config) {
    const config = JSON.parse(__supabase_config);
    // Assuming the config format might differ from VITE envs,
    // we extract the URL and Anon Key directly.
    supabaseConfig = {
      url: config.supabaseUrl, 
      anonKey: config.supabaseAnonKey,
    };
    apiKey = ""; // API key is handled by the canvas environment for the fetch call
  } else {
    // Fallback for local development using VITE environment variables
    console.warn("Using VITE environment variables for Supabase config.");
    supabaseConfig = {
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    };

    if (!supabaseConfig.url || supabaseConfig.url.includes("YOUR_SUPABASE_URL")) {
      console.error("SUPABASE ERROR: URL or Anon Key is missing or invalid. Please check your .env file.");
    }
  }
} catch (e) {
  console.error("Failed to load Supabase configuration:", e);
  supabaseConfig = {};
}


// Initialize Supabase Client
const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey
);

// --- Authentication Functions ---

/**
 * Initiates Google OAuth sign-in via a popup.
 */
export const signInWithGoogle = async () => {
    // Use the `__initial_auth_token` if available for silent sign-in, 
    // otherwise fallback to standard Google OAuth.
    // NOTE: This assumes the user is using the standard Supabase flow.
    // For environments requiring a custom token, you would need to use 
    // `supabase.auth.signInWithCustomToken()`. 
    // For standard Google OAuth:
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin, // Redirect back to the app's origin
            },
        });

        if (error) {
            throw error;
        }
    } catch (error) {
        console.error("Supabase Login Error:", error);
        // Use a custom error notification instead of alert
        const message = document.createElement('div');
        message.className = 'fixed top-4 right-4 bg-red-600 text-white p-3 rounded-lg shadow-xl';
        message.innerText = `Login Failed: ${error.message}`;
        document.body.appendChild(message);
        setTimeout(() => message.remove(), 3000);
    }
};

/**
 * Signs out the current user.
 */
export const signOutUser = async () => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }
    } catch (error) {
        console.error("Supabase Logout Error:", error);
    }
};

/**
 * Exposes the Supabase client's auth listener.
 * This function signature is designed to mimic the Firebase `onAuthStateChanged` for easier migration
 * but uses the Supabase `onAuthStateChange` structure.
 * @param {function} callback - Function to call on auth state change.
 * @returns {function} An unsubscribe function.
 */
export const onAuthChange = (callback) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
            // Transform the Supabase session/event into a Firebase-like user object 
            // for minimal changes in consuming components (Auth.jsx).
            const user = session ? session.user : null;
            callback(user);
        }
    );
    // Supabase subscription returns a `data` object with a `subscription` object inside,
    // which has an unsubscribe method.
    return () => subscription.unsubscribe();
};


// --- Data Functions ---

const TREES_TABLE = 'family_trees';

/**
 * Saves or updates a family tree for the current user.
 * @param {string} treeId - The unique ID for the tree (e.g., family surname).
 * @param {{nodes: Array, edges: Array}} treeData - The ReactFlow data object.
 */
export const saveTreeToSupabase = async (treeId, treeData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("Save Error: User not authenticated.");
        return;
    }

    // Supabase upsert requires the primary keys (user_id, tree_id) and the data.
    const treeRecord = {
        user_id: user.id,
        tree_id: treeId,
        nodes: treeData.nodes, // MAPS TO nodes JSONB column
        edges: treeData.edges, // MAPS TO edges JSONB column
        // updated_at will be set by the DB trigger or by your code (optional, but good practice)
    };

    try {
        const { error } = await supabase
            .from(TREES_TABLE)
            .upsert(treeRecord, { onConflict: 'user_id, tree_id' }); // Upsert based on composite key

        if (error) {
            throw error;
        }
        console.log(`Tree '${treeId}' successfully saved/updated.`);
    } catch (error) {
        console.error("Error saving tree to Supabase:", error);
        throw new Error(`Failed to save tree: ${error.message}`);
    }
};

/**
 * Loads a specific family tree for the current user.
 * @param {string} treeId - The unique ID of the tree to load.
 * @returns {Promise<{nodes: Array, edges: Array}>} The tree data, or an empty object on failure.
 */
export const loadTreeFromSupabase = async (treeId) => {
    const { data: { user } } = await supabase.auth.getUser();
    // ... authentication check ...

    try {
        const { data, error } = await supabase
            .from(TREES_TABLE)
            // FIX 3: Select 'nodes' and 'edges' directly
            .select('nodes, edges')
            .eq('user_id', user.id)
            .eq('tree_id', treeId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is 'no rows found'
            throw error;
        }

        // Return the nodes and edges directly, or an empty structure
        return data ? { nodes: data.nodes, edges: data.edges } : { nodes: [], edges: [] };

    } catch (error) {
        console.error("Error loading tree from Supabase:", error);
        return { nodes: [], edges: [] };
    }
};

/**
 * Retrieves a list of all tree IDs (surnames) for the current user.
 * @returns {Promise<Array<string>>} An array of tree IDs.
 */
export const getAllTreeIds = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.log("Retrieve Tree IDs Error: No authenticated user found.");
        return [];
    }

    try {
        const { data, error } = await supabase
            .from(TREES_TABLE)
            .select('tree_id') // Select only the ID
            .eq('user_id', user.id);

        if (error) {
            throw error;
        }

        // Map the result to an array of strings
        return data.map(record => record.tree_id);

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("User not authenticated.");
    }

    try {
        const { error } = await supabase
            .from(TREES_TABLE)
            .delete()
            .eq('user_id', user.id)
            .eq('tree_id', treeId);

        if (error) {
            throw error;
        }

        console.log(`Tree '${treeId}' successfully deleted.`);
    } catch (error) {
        console.error("Error deleting tree:", error);
        throw error;
    }
};

// Export the Supabase client itself if needed for direct access
export { supabase };
