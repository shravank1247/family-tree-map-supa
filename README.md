🌳 Family Tree Map App
A collaborative, interactive family tree visualization tool built with React, React Flow, and Supabase.

Explore family connections, create rich member profiles, and share your story—all with real-time updates, robust PostgreSQL storage, and secure Google authentication via Supabase.

✨ Features
🔐 Google Authentication – Secure sign-in via Supabase Auth.

🎨 Visual Tree Builder – Intuitive drag-and-drop graph using React Flow.

👥 Rich Member Profiles – Add names, photos, notes, and custom tags.

🌈 Color-Coded Generations – Each generation highlighted automatically.

📸 Photo Upload – Attach a picture to each member.

💾 Cloud Storage – Trees are stored safely in Supabase PostgreSQL.

🔄 Real-Time Collaboration – Live updates for all collaborators.

🧩 Optimized Structure – Nodes and edges stored as compressed JSONB.

📤 Export as PNG or PDF – Download your tree as image or PDF.

✏️ Easy Editing – Right-click any node for quick edits.

🗑️ Delete Members – Remove members with confirmation.

📱 Responsive Design – Works on all devices.

🚀 Quick Start
Prerequisites
Node.js (v18 or higher)

npm or yarn

Supabase project with database and Google Auth configured

🧱 Supabase Setup (Required)
Database Schema (family_trees Table):

Columns: user_id, tree_id, nodes (JSONB), and edges (JSONB)

Enable Row Level Security (RLS)

Add policies for the authenticated role:

sql
auth.uid() = user_id
Authentication (Google OAuth):

Go to Authentication → Providers in Supabase

Enable Google and input your Client ID & Secret

Add your Supabase Redirect URI to Google Cloud Console under Authorized redirect URIs

🧩 Local Installation
Clone the repository

bash
git clone [Your Repository URL]
cd family-tree-map-app
Install dependencies

bash
npm install
Configure Supabase

Create a .env in the root:

text
VITE_SUPABASE_URL="YOUR_SUPABASE_URL"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
Remove any residual Firebase configs or packages:

bash
npm uninstall firebase
Run the development server

bash
npm run dev
Open http://localhost:5173 in your browser.

📁 Project Structure
text
family-tree-map-app/
├── .github/workflows/
│   └── deploy.yaml             # GitHub Actions workflow
├── .vscode/
▶   ...                         # VSCode settings
├── assets/
├── dist/
├── node_modules/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── Auth.jsx            # Supabase authentication component
│   │   ├── CustomNode.jsx      # Tree node UI
│   │   ├── PropertiesPane.jsx  # Edit/view member details
│   ├── screens/
│   │   ├── AddMember.jsx
│   │   ├── Home.jsx
│   │   ├── TreeView.jsx
│   │   └── TreeView_2.jsx
│   ├── Services/
│   │   ├── firebase.js         # (Can be deleted if migration is finished)
│   │   └── supabase.js         # Supabase client and CRUD helpers
│   ├── App.css
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env                        # Environment variables
├── README.md
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
├── package-lock.json
🎮 How to Use
Getting Started
Sign in with Google.

Click "Create New Tree" or choose an existing tree.

Building Your Tree
Click a node to select it.

Use toolbar/buttons to:

⬆️ Add Parent

⬇️ Add Child

↔️ Add Sibling

Editing Members
Right-click a node to open the properties pane.

Update:

Name, Family Name

Tags (e.g., "Father", "Teacher")

Notes

Profile Photo

Managing Your Tree
Collapse/Expand: Show/hide branches with +/- toggles.

Delete: Right-click → Delete.

Drag & Pan: Move nodes or the whole graph.

Zoom: Use your mouse or UI controls.

Save: Data is auto-saved or can be manually committed.

Exporting
PNG/PDF: Download your entire tree as an image or printable PDF.

Reset: Clear and start a new tree (with confirmation).

🎨 Color Coding
Each generation is color-coded:

🟪 Root (Grandparents)

🔵 Parents

🟢 You/Siblings

🟡 Children

🌸 Grandchildren+

🛠️ Technologies Used
React – UI rendering

React Flow – Graph visualization and node interaction

Supabase – Auth & database

Dagre – Hierarchical graph layout

Tailwind CSS – Styling/UI design

html2canvas – Canvas screenshots

jsPDF – PDF export

Vite – Fast build tool

🔧 Available Scripts
npm run dev – Start development server

npm run build – Build for production

npm run preview – Preview build

🐛 Troubleshooting
Authentication Issues
Check Supabase Google Auth credentials & redirect URI.

Review environment variables in .env.

Tree Not Saving/Loading
Ensure RLS is enabled and using: auth.uid() = user_id

Check browser developer console for errors.

Export Problems
Confirm html2canvas and jsPDF are installed.

For very large trees, try exporting a smaller section.

🗄️ Supabase Security Policies
Set these policies on your family_trees table:

sql
create policy "Users can read own trees"
    on family_trees for select
    using (auth.uid() = user_id);

create policy "Users can insert own trees"
    on family_trees for insert
    with check (auth.uid() = user_id);

create policy "Users can update own trees"
    on family_trees for update
    using (auth.uid() = user_id);

create policy "Users can delete own trees"
    on family_trees for delete
    using (auth.uid() = user_id);
🤝 Contributing
Pull requests and feature suggestions are welcome!
Open an issue to report bugs or propose enhancements.

📄 License
Open source under the MIT License.

🙏 Acknowledgments
React Flow team — graph UI

Supabase — Auth & data

Dagre — graph layout

Special thanks to contributors!

Build your family legacy—one branch at a time. 🌳👨‍👩‍👧‍👦