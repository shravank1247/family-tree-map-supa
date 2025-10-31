import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';

const MAX_BASE64_SIZE = 948576; // ~948KB, fits under 1MB Firestore limit

const CustomNode = ({ id, data, selected, isConnectable }) => {
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(data.label);
  const [image, setImage] = useState(data.image);

  // Image Upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  // Save Handler
  const handleSave = () => {
    if (image && image.length > MAX_BASE64_SIZE) {
      window.alert('Image too large! Please use a smaller image.');
      return;
    }
    data.onUpdate(id, {
      label: name,
      image,
    });
    setEditMode(false);
  };

  // Filtering Logic
  const isFiltered = (data.selectedTags &&
    data.selectedTags.length > 0 &&
    !data.selectedTags.some((tag) => data.tags.includes(tag)));
  if (isFiltered) return null;

  // Node UI
  return (
    <div
      className={`bg-white border-2 rounded shadow-xl w-[180px] h-[140px] flex flex-col items-center justify-between relative transition-all duration-200
        ${selected ? 'border-indigo-500 scale-102' : 'border-gray-200'}
        ${data.collapsed ? 'opacity-70' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setEditMode(true);
      }}
    >
      {/* Parent/Spouse Handle */}
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />

      {/* Image, blank if missing */}
      <div className="w-full h-[80px] bg-gray-200 flex items-center justify-center rounded-t">
        {image ? (
          <img src={image} alt="avatar" className="w-full h-[80px] object-cover rounded-t" />
        ) : (
          <div className="w-full h-[80px]"></div>
        )}
      </div>

      {/* Node Content */}
      <div className="w-full text-center py-1 px-1 flex flex-col justify-center flex-grow">
        {/* Name: larger font */}
        <div className="text-base font-bold truncate text-gray-800 leading-tight">{name}</div>

        {/* DOB/Anniversary: extra small font, lighter color. */}
        <div className="text-[0.65rem] text-gray-600 leading-snug">
          {data.dob && <span><span className="mr-1 font-medium">DOB:</span>{data.dob}</span>}
          {(data.dob && data.anniversary) ? <span className="mx-2">|</span> : null}
          {data.anniversary && <span><span className="mr-1 font-medium">Ann:</span>{data.anniversary}</span>}
        </div>

        {/* Tags: extra small italic */}
        {data.tags && (
          <div className="text-[0.7rem] italic text-gray-500 leading-snug truncate">{data.tags.split(',').map(tag => tag.trim()).join(' · ')}</div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        className="absolute top-1 right-1 text-xs bg-white bg-opacity-80 p-1 rounded-full shadow-md z-20"
        onClick={() => data.toggleCollapse(id)}
        title={data.collapsed ? 'Expand Children' : 'Collapse Children'}
      >
        {data.collapsed ? '+' : '-'}
      </button>

      {/* Child Handle */}
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />

      {/* Edit Mode: Context Menu */}
      {editMode && (
        <div className="absolute top-0 left-0 w-full h-full bg-white p-2 z-30 shadow-2xl rounded-lg border-4 border-indigo-400">
          {/* Name */}
          <label className="text-xs font-medium text-gray-500">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full mb-1 border p-1 text-sm rounded focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Full Name"
          />
          {/* Image Upload */}
          <label className="text-xs font-medium text-gray-500">Image</label>
          <input type="file" onChange={handleImageUpload} className="mb-2 w-full text-xs" />
          {/* Buttons */}
          <div className="flex justify-between mt-2">
            <button onClick={handleSave} className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600">
              Save
            </button>
            <button onClick={() => data.onDelete(id)} className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600">
              Delete
            </button>
            <button onClick={() => setEditMode(false)} className="bg-gray-400 text-white px-2 py-1 rounded text-xs hover:bg-gray-500">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomNode;
