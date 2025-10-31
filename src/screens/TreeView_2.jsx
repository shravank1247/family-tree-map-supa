//Just rename the file with TreeView.jsx and you will see a different view of toolbars on pane
// src/screens/TreeView.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MiniMap,
  MarkerType,
  SmoothStepEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import CustomNode from '../components/CustomNode';
import PropertiesPane from '../components/PropertiesPane'; // <<<<< CRITICAL FIX: ADDED MISSING IMPORT
import { saveTreeToFirestore, loadTreeFromFirestore, auth } from '../Services/firebase'; 
import { useNavigate } from 'react-router-dom';

const nodeTypes = { customNode: CustomNode };

// Dagre layout configuration
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Node size: 180px width x 140px height
const nodeWidth = 180; 
const nodeHeight = 140; 

// Utility function to safely clean node data before saving to Firestore or History
const getCleanNodeData = (data) => {
    // CRITICAL: Destructure out all non-serializable properties (functions and derived state)
    const { onUpdate, onDelete, toggleCollapse, selectedTags, level, ...cleanData } = data;
    
    // Return all remaining serializable properties
    return cleanData;
};


// Calculate hierarchical layout using Dagre
const getLayoutedElements = (nodes, edges) => {
  // CRITICAL FIX: Only run Dagre on nodes that HAVEN'T been manually positioned (no positionAbsolute)
  const dagreNodes = nodes.filter(n => !n.positionAbsolute);
  
  // If there are no nodes left for Dagre to process, return original nodes/edges
  if (dagreNodes.length === 0) {
      return { nodes, edges };
  }

  // Use 'TB' (Top-to-Bottom) for hierarchy
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 120 }); // Adjusted ranksep for new height

  dagreNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  // Only consider hierarchical (parent_child) edges for layout
  const hierarchicalEdges = edges.filter(e => 
      e.type === 'parent_child' && 
      dagreNodes.some(n => n.id === e.source) && 
      dagreNodes.some(n => n.id === e.target)
  );
  hierarchicalEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    
    // 1. If positionAbsolute exists (manual position/spouse), use it and clear positionAbsolute
    if (node.positionAbsolute) {
        // Use the absolute position and clear the temp field
        const absolutePosition = { ...node.positionAbsolute };
        return {
            ...node,
            position: absolutePosition,
            positionAbsolute: undefined, // Clear after applying to position
        };
    }
    
    // 2. If node was processed by Dagre, use the calculated position
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
        const x = nodeWithPosition.x - nodeWidth / 2;
        const y = nodeWithPosition.y - nodeHeight / 2;
        return {
            ...node,
            position: { x, y },
        };
    } 
    
    // 3. Fallback for nodes that weren't in dagreNodes (e.g., if only one node exists)
    return node;
  });

  return { nodes: layoutedNodes, edges };
};

// Calculate node levels (Generation colors)
const calculateNodeLevels = (nodes, edges) => {
  const levels = {};
  const hierarchicalEdges = edges.filter(e => e.type === 'parent_child');
  const targets = new Set(hierarchicalEdges.map((e) => e.target));
  const rootIds = nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);

  const queue = [...rootIds];
  rootIds.forEach(id => { levels[id] = 0; });

  while (queue.length > 0) {
      const nodeId = queue.shift();
      const currentLevel = levels[nodeId];

      const spouseEdge = edges.find(e => e.type === 'spouse' && (e.source === nodeId || e.target === nodeId));
      if (spouseEdge) {
          const spouseId = spouseEdge.source === nodeId ? spouseEdge.target : spouseEdge.source;
          if (levels[spouseId] === undefined) { levels[spouseId] = currentLevel; }
      }

      hierarchicalEdges.filter(e => e.source === nodeId).forEach((edge) => {
          const childId = edge.target;
          if (levels[childId] === undefined || levels[childId] < currentLevel + 1) {
              levels[childId] = currentLevel + 1;
              queue.push(childId);
          }
      });
  }
  
  nodes.forEach(n => {
      if (levels[n.id] === undefined) { levels[n.id] = 0; }
  });

  return levels;
};


const TreeView = () => {
  const navigate = useNavigate();
  // Using ReactFlow hooks for local state
  const [nodes, setNodes, onNodesChangeReactFlow] = useNodesState([]);
  const [edges, setEdges, onEdgesState] = useEdgesState([]);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  
  // --- HISTORY STATE ---
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // --- Utility Functions ---
  
  // Use useMemo for selected node for performance
  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);

  // Handle saving the current state to Firestore (called by takeSnapshot)
  const handleSave = useCallback(async (currentNodes, currentEdges) => {
      // CRITICAL: Skip save if user is not authenticated yet.
      if (!user) {
          console.warn("Save attempted before user authentication resolved. Save skipped.");
          return;
      }
      
      try {
        const cleanNodes = currentNodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          // CRITICAL: Ensure positionAbsolute is saved for manual positions
          positionAbsolute: n.positionAbsolute, 
          data: getCleanNodeData(n.data), // Use cleaning utility
        }));
  
        const cleanEdges = currentEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          ...(e.style && { style: e.style }), 
          ...(e.markerEnd && { markerEnd: e.markerEnd }), 
        }));
  
        await saveTreeToFirestore(cleanNodes, cleanEdges);
        // console.log("Firestore Save successful!"); 
      } catch (error) {
        console.error('Error saving tree:', error);
      }
  }, [user]); 

  // Take a snapshot for History and trigger Firestore save
  const takeSnapshot = useCallback((currentNodes, currentEdges) => {
    // 1. Clean data for history/Firestore
    const cleanNodes = currentNodes.map((n) => ({
        id: n.id, type: n.type, position: n.position, 
        positionAbsolute: n.positionAbsolute, // Include positionAbsolute
        data: getCleanNodeData(n.data),
    }));
    const cleanEdges = currentEdges.map((e) => ({
        id: e.id, source: e.source, target: e.target, type: e.type,
        ...(e.style && { style: e.style }), 
        ...(e.markerEnd && { markerEnd: e.markerEnd }),
    }));
    
    // 2. Manage history array: discard future states
    setHistory(h => {
        const newHistory = h.slice(0, historyIndex + 1);
        return [...newHistory, { nodes: cleanNodes, edges: cleanEdges }];
    });
    setHistoryIndex(i => i + 1); 

    // 3. Save to Firestore (auto-save)
    handleSave(currentNodes, currentEdges); 
  }, [historyIndex, handleSave]);


  const onNodesChange = useCallback(onNodesChangeReactFlow, [onNodesChangeReactFlow]); 

  const extractAllTags = useCallback((currentNodes) => {
    const tags = new Set();
    currentNodes.forEach(node => {
      if (node.data.tags) {
        node.data.tags.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) tags.add(trimmedTag);
        });
      }
    });
    setAllTags(Array.from(tags).sort());
  }, []);

  // Central function to update state, inject callbacks, and optionally run layout/take snapshot
  const applyLayoutAndLevels = useCallback((updatedNodes, updatedEdges, runLayout = true, skipSnapshot = false) => {
      const levels = calculateNodeLevels(updatedNodes, updatedEdges);
      extractAllTags(updatedNodes); 
      
      const nodesWithCallbacks = updatedNodes.map((node) => ({
          ...node,
          data: {
              ...getCleanNodeData(node.data), // Ensure only clean data is used for merging
              ...node.data, // Keep incoming data (like position, etc.)
              level: levels[node.id] || 0,
              // Inject callbacks for ReactFlow component
              onUpdate: updateNodeData,
              onDelete: deleteNode,
              toggleCollapse: toggleCollapse,
          },
      }));

      let finalNodes = nodesWithCallbacks;
      let finalEdges = updatedEdges;

      if (runLayout) {
        const layouted = getLayoutedElements(nodesWithCallbacks, updatedEdges);
        finalNodes = layouted.nodes;
        finalEdges = layouted.edges;
      } 
      
      setNodes(finalNodes);
      setEdges(finalEdges);

      if (!skipSnapshot) {
        // This is a mutation from UI/code, so save it to history/Firestore
        takeSnapshot(finalNodes, finalEdges);
      }
  }, [setNodes, setEdges, extractAllTags, takeSnapshot]); 


  // --- HISTORY HANDLERS ---
  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const { nodes: savedNodes, edges: savedEdges } = history[newIndex];
    // Load the state from history. Skip layout (positions are saved) and skip snapshot.
    applyLayoutAndLevels(savedNodes, savedEdges, false, true); 
  }, [history, historyIndex, canUndo, applyLayoutAndLevels]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const { nodes: savedNodes, edges: savedEdges } = history[newIndex];
    // Load the state from history. Skip layout (positions are saved) and skip snapshot.
    applyLayoutAndLevels(savedNodes, savedEdges, false, true);
  }, [history, historyIndex, canRedo, applyLayoutAndLevels]);


  // Check authentication & Load tree
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadTree(currentUser); 
      } else {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const loadTree = async (currentUser) => {
    setLoading(true);
    try {
      const { nodes: savedNodes, edges: savedEdges } = await loadTreeFromFirestore(currentUser.uid);
      if (savedNodes.length > 0) {
        // Load the saved state into ReactFlow. Skip snapshot as this is the load operation.
        applyLayoutAndLevels(savedNodes, savedEdges, false, true); 
        // Manually set history index for the initial state
        setHistory([{ nodes: savedNodes, edges: savedEdges }]);
        setHistoryIndex(0);
      } else {
        createInitialTree();
      }
    } catch (error) {
      console.error('Error loading tree:', error);
      createInitialTree();
    } finally {
      setLoading(false);
    }
  };

  const createInitialTree = () => {
    const rootNode = {
      id: 'root_' + Date.now(),
      type: 'customNode',
      data: {
        label: 'Family Root',
        familyName: '',
        dob: '', 
        anniversary: '', 
        tags: 'Root, Living', 
        notes: 'Start building your family tree here',
        image: '',
        collapsed: false,
        level: 0,
      },
      position: { x: 250, y: 50 },
    };
    // Run layout, but don't take snapshot initially, it will be handled by takeSnapshot inside applyLayoutAndLevels
    applyLayoutAndLevels([rootNode], [], true, false); 
  };
  
  // Update node data (called from PropertiesPane)
  const updateNodeData = useCallback(
    (nodeId, newData) => {
      setNodes((nds) => {
        const updatedNodes = nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        );
        // Note: applyLayoutAndLevels is called with updatedNodes to inject callbacks/levels and take snapshot
        applyLayoutAndLevels(updatedNodes, edges, false, false); 
        return updatedNodes;
      });
    },
    [setNodes, edges, applyLayoutAndLevels]
  );

  // Delete node (called from PropertiesPane)
  const deleteNode = useCallback(
    (nodeId) => {
      const updatedNodes = nodes.filter((n) => n.id !== nodeId);
      const updatedEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      
      // Run layout and take snapshot
      applyLayoutAndLevels(updatedNodes, updatedEdges, true, false); 

      if (selectedNodeId === nodeId) { setSelectedNodeId(null); }
    },
    [nodes, edges, selectedNodeId, applyLayoutAndLevels]
  );

  const toggleCollapse = useCallback(
    (nodeId) => {
        const updatedNodes = nodes.map((node) =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } }
                : node
        );
        
        const sourceNode = nodes.find((n) => n.id === nodeId);
        const newCollapsedState = !sourceNode?.data.collapsed;

        const updatedEdges = edges.map((edge) => {
            if (edge.type === 'parent_child') {
                if (edge.source === nodeId) {
                    return { ...edge, hidden: newCollapsedState };
                }
                
                if (newCollapsedState) {
                    let currentSourceId = edge.source;
                    while(currentSourceId !== null) {
                        const parentNode = updatedNodes.find(n => n.id === currentSourceId);
                        if (parentNode?.data.collapsed) {
                            return { ...edge, hidden: true };
                        }
                        const parentEdge = edges.find(e => e.target === currentSourceId && e.type === 'parent_child');
                        currentSourceId = parentEdge ? parentEdge.source : null;
                    }
                }
                
                if (!newCollapsedState && edge.hidden) {
                    const source = updatedNodes.find(n => n.id === edge.source);
                    if (source && !source.data.collapsed) {
                        return { ...edge, hidden: false };
                    }
                }
            }
            return edge;
        });
        
        // Skip layout run, but take snapshot
        applyLayoutAndLevels(updatedNodes, updatedEdges, false, false); 
    },
    [nodes, edges, applyLayoutAndLevels]
  );


  const addNode = useCallback(
    (type) => {
      if (!selectedNodeId) {
        alert('⚠️ Please select a node first by clicking on it!');
        return;
      }
      
      const selectedNode = nodes.find(n => n.id === selectedNodeId);
      if (!selectedNode) return;

      const newNodeId = `node_${Date.now()}`;
      const newNode = {
        id: newNodeId,
        type: 'customNode',
        data: {
          label: type === 'spouse' ? 'New Spouse' : (type === 'parent' ? 'New Parent' : 'New Child'),
          familyName: selectedNode.data.familyName,
          dob: '', anniversary: '', tags: '', notes: '', image: '',
          collapsed: false,
          level: 0,
        },
        position: { x: 0, y: 0 }, // Base position. Dagre will change this unless positionAbsolute is set.
      };

      let newEdges = [...edges];
      let runLayout = true; // Default to running Dagre layout

      if (type === 'child') {
        const spouseEdge = edges.find((e) => e.type === 'spouse' && (e.source === selectedNodeId || e.target === selectedNodeId));
        const parent1Id = selectedNodeId;
        const parent2Id = spouseEdge ? (spouseEdge.source === selectedNodeId ? spouseEdge.target : spouseEdge.source) : null;
        
        newEdges.push({ id: `e${parent1Id}-${newNodeId}`, source: parent1Id, target: newNodeId, type: 'parent_child' });

        if (parent2Id) {
            newEdges.push({ id: `e${parent2Id}-${newNodeId}`, source: parent2Id, target: newNodeId, type: 'parent_child' });
        }
        alert(`✅ Child added from ${selectedNode.data.label}${parent2Id ? ' and spouse' : ''}! Applying layout...`);

      } else if (type === 'spouse') {
        const existingSpouseEdge = edges.find((e) => (e.source === selectedNodeId || e.target === selectedNodeId) && e.type === 'spouse');
        if (existingSpouseEdge) {
            alert('⚠️ Cannot add a new spouse. A spouse link already exists for the selected node.');
            return;
        }

        // CRITICAL FIX: Calculate position next to the selected node and use positionAbsolute.
        // NodeWidth is 180, gap is 50. Total displacement = 180 + 50.
        newNode.positionAbsolute = {
            x: selectedNode.position.x + nodeWidth + 50, 
            y: selectedNode.position.y,
        };
        runLayout = false; // Do not run Dagre, use the absolute position.

        newEdges.push({
          id: `e-spouse-${selectedNodeId}-${newNodeId}`,
          source: selectedNodeId,
          target: newNodeId,
          type: 'spouse', 
          style: { stroke: '#ec4899', strokeWidth: 3, strokeDasharray: '6 6' }, 
        });
        alert(`✅ Spouse added next to ${selectedNode.data.label}.`);
        
      } else if (type === 'parent') { 
        newEdges.push({
            id: `e${newNodeId}-${selectedNodeId}`,
            source: newNodeId,
            target: selectedNodeId,
            type: 'parent_child', 
        });
        alert(`✅ Parent added above ${selectedNode.data.label}! You can select the new parent to add a spouse or another parent. Applying layout...`);
        
      } else {
          return; 
      }

      const updatedNodes = [...nodes, newNode];
      // Pass the calculated 'runLayout' flag
      applyLayoutAndLevels(updatedNodes, newEdges, runLayout, false); 
      setSelectedNodeId(newNodeId);
    },
    [selectedNodeId, nodes, edges, applyLayoutAndLevels]
  );
  
  const handleManualSave = async () => {
    // Manually trigger the snapshot which also calls handleSave
    takeSnapshot(nodes, edges);
    alert('✅ Tree saved successfully!');
  };

  const handleTagToggle = (tag) => {
    setSelectedTags(prevTags => prevTags.includes(tag) ? prevTags.filter(t => t !== tag) : [...prevTags, tag] );
  };

  // CRITICAL FIX: Track manual positioning on drag stop and save history
  const handleNodeDragStop = useCallback((event, node) => {
    
    // 1. Create a copy of nodes and mark the dragged node with positionAbsolute
    const nodesWithAbsolute = nodes.map(n => {
        if (n.id === node.id) {
             // Save the current position as positionAbsolute to mark it as manually placed
             return { ...n, positionAbsolute: { x: node.position.x, y: node.position.y } };
        }
        return n;
    });

    // 2. Run applyLayoutAndLevels, skipping layout (false) but taking a snapshot (false)
    // This correctly updates the state, injects callbacks/levels, and saves the manual position to history/firestore.
    applyLayoutAndLevels(nodesWithAbsolute, edges, false, false);

  }, [nodes, edges, applyLayoutAndLevels]);


  const handleExport = async (type) => {
    try {
      const flowElement = document.querySelector('.react-flow');
      if (!flowElement) return;

      // Temporarily set scale to 1 for high-res capture if needed, then revert
      const originalTransform = flowElement.style.transform;
      flowElement.style.transform = 'scale(1)';
      flowElement.style.transformOrigin = 'top left';

      const canvas = await html2canvas(flowElement, { 
        backgroundColor: '#ffffff', 
        scale: 2,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: flowElement.scrollWidth,
        windowHeight: flowElement.scrollHeight,
      });

      // Revert style
      flowElement.style.transform = originalTransform;
      flowElement.style.transformOrigin = '';

      const imgData = canvas.toDataURL('image/png');
      
      if (type === 'png') {
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `family-tree-${Date.now()}.png`;
        link.click();
      } else if (type === 'pdf') {
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`family-tree-${Date.now()}.pdf`);
      }
      alert(`✅ Tree exported as ${type.toUpperCase()} successfully!`);
    } catch (error) {
      console.error('Error exporting tree:', error);
      alert('❌ Failed to export tree. Please try again.');
    }
  };

  // Prepare nodes for ReactFlow, applying multi-tag filter logic
  const nodesForRender = useMemo(() => nodes.map(node => {
    return { 
      ...node, 
      data: { 
        ...node.data, 
        selectedTags: selectedTags,
      },
      // Ensure that positionAbsolute is respected if set
      position: node.positionAbsolute || node.position,
    };
  }), [nodes, selectedTags]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="bg-indigo-600 text-white p-3 flex justify-between items-center flex-shrink-0">
        <h1 className="text-xl font-bold">Family Tree Map</h1>
        <div className="flex gap-4 items-center">
            {/* Action Buttons */}
            <button onClick={handleManualSave} className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded text-sm transition-colors">
                💾 Save Tree
            </button>
            <button onClick={() => handleExport('png')} className="bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-sm transition-colors">
                🖼️ Export PNG
            </button>
            <button onClick={() => handleExport('pdf')} className="bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded text-sm transition-colors">
                📄 Export PDF
            </button>
            <button onClick={handleUndo} disabled={!canUndo} className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded text-sm disabled:opacity-30 transition-colors">
                ↩️ Undo
            </button>
            <button onClick={handleRedo} disabled={!canRedo} className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded text-sm disabled:opacity-30 transition-colors">
                ↪️ Redo
            </button>
            <button onClick={() => { auth.signOut().then(() => navigate('/')) }} className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm transition-colors">
                Logout
            </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* RENDER LEFT-SIDE CONTROLS */}
        <div className="w-[250px] bg-white p-4 border-r overflow-y-auto flex-shrink-0">
            <h2 className="text-lg font-semibold mb-3 text-indigo-700">Add Member</h2>
            <div className="space-y-2">
                {nodes.length === 0 ? (
                    <button onClick={() => createInitialTree()} className="w-full bg-purple-500 text-white p-2 rounded hover:bg-purple-600">
                        ➕ Add Root Node
                    </button>
                ) : (
                    <>
                        <p className="text-sm text-gray-500 mb-2">Selected Node: **{selectedNode?.data.label || 'None'}**</p>
                        <button onClick={() => addNode('child')} disabled={!selectedNodeId} className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50">
                            👶 Add Child
                        </button>
                        <button onClick={() => addNode('spouse')} disabled={!selectedNodeId} className="w-full bg-pink-500 text-white p-2 rounded hover:bg-pink-600 disabled:opacity-50">
                            💍 Add Spouse
                        </button>
                        <button onClick={() => addNode('parent')} disabled={!selectedNodeId} className="w-full bg-orange-500 text-white p-2 rounded hover:bg-orange-600 disabled:opacity-50">
                            👨‍👩‍👧 Add Parent
                        </button>
                    </>
                )}
            </div>

            <h2 className="text-lg font-semibold mt-6 mb-3 text-indigo-700 border-t pt-4">Filter by Tags</h2>
            <div className="flex flex-wrap gap-2">
                {/* Dynamically gather unique tags for filtering */}
                {allTags.map(tag => (
                    <button 
                        key={tag}
                        onClick={() => handleTagToggle(tag)}
                        className={`text-xs px-2 py-1 rounded-full transition-colors 
                            ${selectedTags.includes(tag) 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`
                        }
                    >
                        {tag}
                    </button>
                ))}
            </div>
        </div>

        {/* RENDER REACT FLOW MAP */}
        <div className="flex-1 reactflow-wrapper">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodesForRender} 
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesState} // useEdgesState's setter
              onConnect={(params) => {
                  const newEdge = { 
                      ...params, 
                      id: `e-${params.source}-${params.target}-${Date.now()}`,
                      type: 'parent_child', 
                      markerEnd: { type: MarkerType.ArrowClosed },
                  };
                  applyLayoutAndLevels(nodes, [...edges, newEdge], true, false); 
                  alert(`New connection created! Applying layout...`);
              }}
              onNodeClick={(event, node) => setSelectedNodeId(node.id)}
              onNodeDragStop={handleNodeDragStop} // CRITICAL FIX: Save position on drag stop
              nodeTypes={nodeTypes}
              fitView
              defaultEdgeOptions={{
                style: { stroke: '#4f46e5', strokeWidth: 3 }, 
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#4f46e5',
                },
              }}
              edgeTypes={{
                  parent_child: SmoothStepEdge, 
                  spouse: SmoothStepEdge,
              }}
            >
              <Controls className="bg-white shadow-lg rounded-lg" />
              <Background color="#d1d5db" gap={16} size={1} />
              <MiniMap
                nodeColor={(node) => {
                  const level = node.data.level || 0;
                  const colors = ['#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
                  return colors[level % colors.length];
                }}
                className="bg-white shadow-lg rounded-lg"
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* RENDER RIGHT-SIDE PROPERTIES PANE */}
        {selectedNode && (
          <PropertiesPane 
              node={selectedNode} 
              onSave={updateNodeData} 
              onDelete={deleteNode}
              onDeselect={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-gray-800 text-white text-xs py-2 px-4 flex justify-between items-center flex-shrink-0">
        <div>
          Total Members: <strong>{nodes.length}</strong> | Connections: <strong>{edges.length}</strong> | History: **{historyIndex + 1}/{history.length}**
        </div>
        <div className="flex gap-4">
          <span>💡 Tip: Right-click a node to open the full edit panel</span>
          <span>🎨 Colors indicate generation/level</span>
        </div>
      </div>
    </div>
  );
};

export default TreeView;