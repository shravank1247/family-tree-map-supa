# 🌳 Family Tree Map App

A collaborative, real-time family tree visualization tool built with ReactFlow and powered by **Supabase**.

This project has been successfully migrated from Firebase to a PostgreSQL backend via Supabase for robust data handling and secure Row Level Security (RLS).

---

## ✨ Features

* **Interactive Tree Visualization:** Uses **ReactFlow** for dynamic drag-and-drop node and edge management.
* **Persistent Storage:** Data is securely saved using **Supabase PostgreSQL** in the `family_trees` table.
* **Secure Authentication:** User sign-in via **Google OAuth** managed entirely by Supabase Auth.
* **Row Level Security (RLS):** Policies ensure users can only read, write, and delete **their own** family trees based on their `user_id`.
* **Data Structure:** Stores all nodes and edges as compressed `JSONB` arrays per user, per tree.

---

## 🚀 Getting Started

### Prerequisites

You need the following installed locally:

* Node.js (v16+)
* npm or yarn
* A **Supabase Project** with the necessary database schema and authentication configured.

### Supabase Setup (Critical)

Your project relies entirely on the Supabase backend. Follow these steps in your Supabase Dashboard:

1.  **Database Schema (`family_trees`):** Ensure the following table and RLS policies are deployed:
    * The `family_trees` table must exist with `user_id`, `tree_id`, `nodes` (JSONB), and `edges` (JSONB) columns.
    * **Row Level Security (RLS)** must be **Enabled** on the `family_trees` table.
    * All four policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) for the `authenticated` role must be set using the condition `auth.uid() = user_id`.

2.  **Authentication:**
    * Navigate to **Authentication > Providers**.
    * Enable the **Google** provider.
    * Configure it using the **Client ID** and **Client Secret** from your Google Cloud Console.
    * Ensure the **Supabase Redirect URI** is listed as an **Authorized redirect URI** in your Google Cloud OAuth 2.0 Client settings.

### Local Installation

1.  **Clone the repository:**
    ```bash
    git clone [Your Repository URL]
    cd family-tree-map-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install @supabase/supabase-js reactflow
    # OR
    # yarn add @supabase/supabase-js reactflow
    ```

3.  **Configure Environment Variables:**
    Create a file named `.env` in the root directory and add your Supabase credentials. **Crucially, remove all old `VITE_FIREBASE_*` variables.**

    ```env
    # --- Supabase Configuration ---
    VITE_SUPABASE_URL="YOUR_SUPABASE_URL"
    VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
    ```

4.  **Run the application:**
    ```bash
    npm run dev
    # OR
    # yarn dev
    ```

---

## 📝 Code Migration Summary

The primary changes involved replacing Firebase logic with the Supabase client:

| File | Migration Action | Key Change Detail |
| :--- | :--- | :--- |
| `src/Services/supabase.js` | Updated Data Access | Replaced table name with `family_trees` and used separate `nodes`/`edges` columns instead of a single `data` object for saving/loading. |
| `src/components/Auth.jsx` | Auth Logic Overhaul | Replaced `auth.onAuthStateChanged` with `onAuthChange`. Replaced `user.uid` with **`user.id`** for storage and display. |
| `src/screens/TreeView.jsx` | Data Flow Update | Replaced all `saveTreeToFirestore` and `loadTreeFromFirestore` calls with `saveTreeToSupabase` and `loadTreeFromSupabase`. |

---

## 🤝 Contribution

Feel free to open issues or submit pull requests. All contributions are welcome!