// src/components/PropertiesPane.jsx

import React, { useState, useEffect } from 'react';

// Approximately 948 KB (Safe buffer for 1MB Firestore limit)
const MAX_BASE64_SIZE = 948576; 

const PropertiesPane = ({ node, onSave, onDelete, onDeselect }) => {
  // Extract data from the node for local form state
  const { id, data } = node;
  
  // Use state hooks for all editable properties
  const [label, setLabel] = useState(data.label || '');
  const [familyName, setFamilyName] = useState(data.familyName || '');
  const [dob, setDob] = useState(data.dob || '');
  const [anniversary, setAnniversary] = useState(data.anniversary || '');
  const [tags, setTags] = useState(data.tags || '');
  const [notes, setNotes] = useState(data.notes || '');
  const [image, setImage] = useState(data.image || ''); // Image is also part of node data

  // Reset local state when a new node is selected (i.e., when node.id changes)
  useEffect(() => {
    setLabel(data.label || '');
    setFamilyName(data.familyName || '');
    setDob(data.dob || '');
    setAnniversary(data.anniversary || '');
    setTags(data.tags || '');
    setNotes(data.notes || '');
    setImage(data.image || '');
  }, [id, data]);
  
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        if (reader.result.length > MAX_BASE64_SIZE) {
            const message = `❌ Image too large! The image data is ${Math.round(reader.result.length / 1024)} KB, but the maximum allowed size is approximately ${Math.round(MAX_BASE64_SIZE / 1024)} KB. Please use a smaller image.`;
            window.alert(message);
            return;
        }
        setImage(reader.result);
    }
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    // Collect all updated data
    const updatedData = {
      label,
      familyName,
      dob,
      anniversary,
      tags,
      notes,
      image,
    };

    // Call the onSave prop from TreeView.jsx
    onSave(id, updatedData);
    alert(`✅ ${label}'s properties saved successfully!`);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${label} and all associated edges? This action cannot be undone.`)) {
      onDelete(id);
    }
  };

  return (
    <div className="w-[320px] h-full bg-white p-4 shadow-xl border-l-4 border-indigo-500 overflow-y-auto flex flex-col flex-shrink-0">
        <div className='flex justify-between items-center border-b pb-3 mb-4 sticky top-0 bg-white z-10'>
            <h3 className="text-xl font-bold text-indigo-600 truncate mr-2">Properties: {label}</h3>
            <button
                onClick={onDeselect}
                className="text-gray-500 hover:text-gray-800 text-2xl font-semibold leading-none"
                title="Close Properties Panel"
            >
                &times;
            </button>
        </div>

        <div className='flex flex-col gap-4 flex-grow'>
            <div className='bg-gray-100 p-2 rounded'>
                <label className="text-xs font-medium text-gray-500 block">Node ID:</label>
                <p className="text-xs text-gray-700 break-all">{id}</p>
            </div>
            
            {/* Name Field */}
            <div>
                <label className="text-sm font-medium text-gray-700">Name (Label):</label>
                <input 
                    type="text" 
                    value={label} 
                    onChange={(e) => setLabel(e.target.value)} 
                    className="w-full border p-2 text-base rounded focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="Full Name" 
                />
            </div>
            
            {/* Family Name Field */}
            <div>
                <label className="text-sm font-medium text-gray-700">Family Name:</label>
                <input 
                    type="text" 
                    value={familyName} 
                    onChange={(e) => setFamilyName(e.target.value)} 
                    className="w-full border p-2 text-base rounded focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="Family Name" 
                />
            </div>

            {/* Image Preview/Upload Section */}
            <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Image:</label>
                {image && (
                    <img src={image} alt="Preview" className="w-full h-24 object-contain mb-2 border-2 border-gray-300 rounded" />
                )}
                <input 
                    type="file" 
                    onChange={handleImageUpload} 
                    className="w-full text-sm block file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" 
                    accept="image/*"
                />
                {image && (
                    <button
                        onClick={() => setImage('')}
                        className="mt-1 text-xs text-red-500 hover:text-red-700"
                    >
                        Remove Image
                    </button>
                )}
            </div>

            {/* DOB Field */}
            <div>
                <label className="text-sm font-medium text-gray-700">Date of Birth (DOB):</label>
                <input 
                    type="text" 
                    value={dob} 
                    onChange={(e) => setDob(e.target.value)} 
                    className="w-full border p-2 text-base rounded focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="e.g., 1980-01-01" 
                />
            </div>

            {/* Anniversary Field */}
            <div>
                <label className="text-sm font-medium text-gray-700">Anniversary/Major Date:</label>
                <input 
                    type="text" 
                    value={anniversary} 
                    onChange={(e) => setAnniversary(e.target.value)} 
                    className="w-full border p-2 text-base rounded focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="e.g., 2005-06-15" 
                />
            </div>

            {/* Tags Field */}
            <div>
                <label className="text-sm font-medium text-gray-700">Tags (Comma Separated):</label>
                <input 
                    type="text" 
                    value={tags} 
                    onChange={(e) => setTags(e.target.value)} 
                    className="w-full border p-2 text-base rounded focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="e.g., Living, Deceased"
                />
            </div>

            {/* Notes Field */}
            <div>
                <label className="text-sm font-medium text-gray-700">Notes:</label>
                <textarea 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)} 
                    rows="3" 
                    className="w-full border p-2 text-base rounded focus:ring-indigo-500 focus:border-indigo-500" 
                    placeholder="Add any relevant notes..."
                />
            </div>
        </div>

        <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 flex-shrink-0">
            <button
                onClick={handleSave}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors mr-2 text-sm font-semibold"
            >
                Save Changes
            </button>
            <button
                onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
            >
                Delete Member
            </button>
        </div>
    </div>
  );
};

export default PropertiesPane;