// src/components/Auth.jsx

import React, { useState, useEffect } from "react";
// 🛑 REMOVED: signInAnonymously import
import { signInWithGoogle, signOutUser, onAuthChange } from "../Services/supabase";

const Auth = ({ onLogin }) => {
    // Supabase auth
    const [user, setUser] = useState(null);

    // Listener to track auth state changes
    useEffect(() => {
        // 👇 Supabase listener
        const unsubscribe = onAuthChange((currentUser) => {
            setUser(currentUser);
            // Call onLogin if provided, to keep parent component (like Home) in sync
            if (onLogin) {
                onLogin(currentUser);
            }
            
            // 🛑 REMOVED: Anonymous sign-in logic
            if (currentUser) {
                // Use the Supabase 'id'
                localStorage.setItem("userId", currentUser.id); 
            } else {
                localStorage.removeItem("userId");
            }
        });
        return () => unsubscribe();
    }, [onLogin]);

    const handleLogin = async () => {
        try {
            // 👇 REPLACED: Supabase login function (Google)
            await signInWithGoogle();
        } catch (error) {
            console.error("Login Error:", error);
        }
    };

    const handleLogout = async () => {
        try {
            // 👇 REPLACED: Supabase logout function
            await signOutUser();
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    if (!user) {
        return (
            <button
                onClick={handleLogin}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
                Sign in with Google
            </button>
        );
    }
    
    // ✅ CRUCIAL FIX: Use user.id for display fallback instead of the deprecated user.uid
    const displayName = user.email || user.id.substring(0, 8); 

    return (
        <div className="flex items-center gap-1">
            <span className="text-sm font-medium">
                {/* Display the name or the start of the ID/email */}
                {displayName.substring(0, 10)} 
            </span>
            <button 
                onClick={handleLogout}
                className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition-colors"
            >
                Logout
            </button>
        </div>
    );
};

export default Auth;