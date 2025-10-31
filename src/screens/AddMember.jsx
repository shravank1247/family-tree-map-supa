import React from "react";

const AddMember = () => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-purple-600 mb-4">Add Family Member</h1>
      <form className="flex flex-col gap-4 max-w-md">
        <input type="text" placeholder="Name" className="border p-2 rounded" />
        <input type="text" placeholder="Relation" className="border p-2 rounded" />
        <button className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600">
          Add Member
        </button>
      </form>
    </div>
  );
};

export default AddMember;