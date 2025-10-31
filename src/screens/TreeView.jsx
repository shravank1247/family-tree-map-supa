// src/screens/TreeView.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import PropertiesPane from '../components/PropertiesPane';
import Auth from '../components/Auth';
// import { saveTreeToFirestore, loadTreeFromFirestore, auth } from '../Services/firebase';
import { saveTreeToSupabase, loadTreeFromSupabase, onAuthChange } from '../Services/supabase';
import { useNavigate, useParams } from 'react-router-dom';

const nodeTypes = { customNode: CustomNode };

// Dagre layout configuration
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Node size: 180px width x 140px height
const nodeWidth = 180;
const nodeHeight = 140;

// Utility function to safely clean node data before saving to Firestore or History
const getCleanNodeData = (data) => {
  const { onUpdate, onDelete, toggleCollapse, selectedTags, level, ...cleanData } = data;
  return Object.entries(cleanData).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

// Calculate hierarchical layout using Dagre
const getLayoutedElements = (nodes, edges) => {
  const dagreNodes = nodes.filter(n => !n.positionAbsolute);

  if (dagreNodes.length === 0) {
    return { nodes, edges };
  }

  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 120 }); // Adjusted ranksep

  dagreNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

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
    if (node.positionAbsolute) {
      return { ...node, position: node.positionAbsolute };
    }
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      const x = nodeWithPosition.x - nodeWidth / 2;
      const y = nodeWithPosition.y - nodeHeight / 2;
      return { ...node, position: { x, y } };
    }
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
  const { treeId } = useParams();

  const [nodes, setNodes, onNodesChangeReactFlow] = useNodesState([]);
  const [edges, setEdges, onEdgesState] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  //firebase auth
  //const [user, setUser] = useState(auth.currentUser);

  //supabase auth
  const [user, setUser] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  // For managing undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Excel-style DOB filter state
  const [dobYears, setDobYears] = useState([]);
  const [dobMonths, setDobMonths] = useState([]);
  const [dobDays, setDobDays] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('');

  // Excel-style Anniversary filter state
  const [annYears, setAnnYears] = useState([]);
  const [annMonths, setAnnMonths] = useState([]);
  const [annDays, setAnnDays] = useState([]);
  const [selectedAnnYear, setSelectedAnnYear] = useState('');
  const [selectedAnnMonth, setSelectedAnnMonth] = useState('');
  const [selectedAnnDay, setSelectedAnnDay] = useState('');

  const saveTimeoutRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [updatedNodesMap, setUpdatedNodesMap] = useState(new Map());

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);

  // Clean and save only updated nodes with throttling
  const takeSnapshot = useCallback((changedNodes, currentEdges) => {
    setUpdatedNodesMap(prev => {
      const newMap = new Map(prev);
      changedNodes.forEach(n => newMap.set(n.id, n));
      return newMap;
    });
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (saving) return;
      setSaving(true);
      try {
        const nodesToSave = Array.from(updatedNodesMap.values());
        if (nodesToSave.length === 0) {
          setSaving(false);
          return;
        }
        const cleanNodes = nodesToSave.map(n => ({
          id: n.id,
          type: n.type,
          ...(n.position && { position: n.position }),
          ...(n.positionAbsolute && { positionAbsolute: n.positionAbsolute }),
          data: getCleanNodeData(n.data),
        }));
        const cleanEdges = currentEdges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          ...(e.style && { style: e.style }),
          ...(e.markerEnd && { markerEnd: e.markerEnd }),
        }));

        // //firebase auth
        // await saveTreeToFirestore(cleanNodes, cleanEdges, treeId);

        //supabase auth
        await saveTreeToSupabase(treeId, {
          nodes: cleanNodes,
          edges: cleanEdges,
        });

        setUpdatedNodesMap(new Map());
      } catch (error) {
        console.error('Error saving tree:', error);
      } finally {
        setSaving(false);
      }
    }, 500);
  }, [updatedNodesMap, saving, treeId]);

  // onNodesChange tracks only changed nodes and triggers takeSnapshot
  const onNodesChange = useCallback((changes) => {
    onNodesChangeReactFlow(changes);
    const changedNodes = changes
      .filter(c => c.type === 'position' && c.position)
      .map(c => {
        const node = nodes.find(n => n.id === c.id);
        if (!node) return null;
        return { ...node, positionAbsolute: c.position };
      })
      .filter(Boolean);
    if (changedNodes.length > 0) {
      takeSnapshot(changedNodes, edges);
    }
  }, [onNodesChangeReactFlow, takeSnapshot, nodes, edges]);

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

  const applyLayoutAndLevels = useCallback((updatedNodes, updatedEdges, runLayout = true, skipSnapshot = false) => {
    const levels = calculateNodeLevels(updatedNodes, updatedEdges);
    extractAllTags(updatedNodes);
    let finalNodes = updatedNodes;
    let finalEdges = updatedEdges;
    if (runLayout) {
      const layouted = getLayoutedElements(updatedNodes, updatedEdges);
      finalNodes = layouted.nodes;
      finalEdges = layouted.edges;
    }
    const nodesWithCallbacks = finalNodes.map((node) => ({
      ...node,
      data: {
        ...getCleanNodeData(node.data),
        ...node.data,
        level: levels[node.id] || 0,
        onUpdate: updateNodeData,
        onDelete: deleteNode,
        toggleCollapse: toggleCollapse,
      },
    }));
    setNodes(nodesWithCallbacks);
    setEdges(finalEdges);
    if (!skipSnapshot) {
      takeSnapshot(nodesWithCallbacks, finalEdges);
    }
  }, [setNodes, setEdges, extractAllTags, takeSnapshot]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const { nodes: savedNodes, edges: savedEdges } = history[newIndex];
    applyLayoutAndLevels(savedNodes, savedEdges, false, true);
  }, [history, historyIndex, canUndo, applyLayoutAndLevels]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const { nodes: savedNodes, edges: savedEdges } = history[newIndex];
    applyLayoutAndLevels(savedNodes, savedEdges, false, true);
  }, [history, historyIndex, canRedo, applyLayoutAndLevels]);

  // //firebase auth
  // useEffect(() => {
  //   const unsubscribe = auth.onAuthStateChanged((currentUser) => {
  //     setUser(currentUser);
  //     if (!currentUser) {
  //       navigate('/');
  //     } else if (treeId) {
  //       loadTree(treeId);
  //     }
  //   });
  //   return () => unsubscribe();
  // }, [navigate, treeId]);


  //supabase auth
  // TreeView.jsx: around line 316
  useEffect(() => {
    // 👇 REPLACED: Use Supabase onAuthChange
    const unsubscribe = onAuthChange((currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        navigate('/');
      } else if (treeId) {
        loadTree(treeId);
      }
    });
    return () => unsubscribe();
  }, [navigate, treeId]);


  useEffect(() => {
    const dobSet = new Set(), dobMonthSet = new Set(), dobDaySet = new Set();
    const annSet = new Set(), annMonthSet = new Set(), annDaySet = new Set();
    nodes.forEach(node => {
      if (node.data?.dob && /^\d{2}-\d{2}-\d{4}$/.test(node.data.dob)) {
        const [d, m, y] = node.data.dob.split('-');
        if (y) dobSet.add(y);
        if (y === selectedYear && m) dobMonthSet.add(m);
        if (y === selectedYear && m === selectedMonth && d) dobDaySet.add(d);
      }
      if (node.data?.anniversary && /^\d{2}-\d{2}-\d{4}$/.test(node.data.anniversary)) {
        const [d, m, y] = node.data.anniversary.split('-');
        if (y) annSet.add(y);
        if (y === selectedAnnYear && m) annMonthSet.add(m);
        if (y === selectedAnnYear && m === selectedAnnMonth && d) annDaySet.add(d);
      }
    });
    setDobYears(Array.from(dobSet).sort());
    setDobMonths(Array.from(dobMonthSet).sort());
    setDobDays(Array.from(dobDaySet).sort());
    setAnnYears(Array.from(annSet).sort());
    setAnnMonths(Array.from(annMonthSet).sort());
    setAnnDays(Array.from(annDaySet).sort());
  }, [nodes, selectedYear, selectedMonth, selectedAnnYear, selectedAnnMonth]);

  const loadTree = async (currentTreeId) => {
    setLoading(true);
    try {
      // //firebase auth
      // const { nodes: savedNodes, edges: savedEdges } = await loadTreeFromFirestore(currentTreeId);
      
      //supabase auth
      const { nodes: savedNodes, edges: savedEdges } = await loadTreeFromSupabase(currentTreeId);
      if (savedNodes.length > 0) {
        applyLayoutAndLevels(savedNodes, savedEdges, false, true);
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
        label: `${treeId} Family Root`,
        familyName: treeId,
        dob: '', anniversary: '', tags: 'Root, Living', notes: 'Start building your tree here', image: '', collapsed: false, level: 0,
      },
      position: { x: 250, y: 50 },
    };
    applyLayoutAndLevels([rootNode], [], true, false);
  };

  const updateNodeData = useCallback(
    (nodeId, newData) => {
      setNodes((nds) => {
        const updatedNodes = nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        );
        applyLayoutAndLevels(updatedNodes, edges, false, false);
        return updatedNodes;
      });
    },
    [setNodes, edges, applyLayoutAndLevels]
  );

  const deleteNode = useCallback(
    (nodeId) => {
      const updatedNodes = nodes.filter((n) => n.id !== nodeId);
      const updatedEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      applyLayoutAndLevels(updatedNodes, updatedEdges, true, false);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
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
            while (currentSourceId !== null) {
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
        dob: '', anniversary: '', tags: '', notes: '', image: '', collapsed: false, level: 0,
      },
      position: { x: 0, y: 0 }, // will be recalculated by layout below
    };

    let newEdges = [...edges];
    let runLayout = true;

    if (type === 'child') {
      // Add edges from selectedNode and possibly spouse(s) as parents
      const spouseEdge = edges.find((e) => e.type === 'spouse' && (e.source === selectedNodeId || e.target === selectedNodeId));
      const parent1Id = selectedNodeId;
      const parent2Id = spouseEdge ? (spouseEdge.source === selectedNodeId ? spouseEdge.target : spouseEdge.source) : null;

      newEdges.push({ id: `e${parent1Id}-${newNodeId}`, source: parent1Id, target: newNodeId, type: 'parent_child' });
      if (parent2Id) {
        newEdges.push({ id: `e${parent2Id}-${newNodeId}`, source: parent2Id, target: newNodeId, type: 'parent_child' });
      }

      alert(`✅ Child added. Applying layout...`);
    } else if (type === 'spouse') {
      const existingSpouseEdge = edges.find((e) => (e.source === selectedNodeId || e.target === selectedNodeId) && e.type === 'spouse');
      if (existingSpouseEdge) {
        alert('⚠️ Cannot add a new spouse. A spouse link already exists for the selected node.');
        return;
      }
      // Position spouse right to selected node
      newNode.positionAbsolute = {
        x: selectedNode.position.x + nodeWidth + 50,
        y: selectedNode.position.y,
      };
      runLayout = false;
      newEdges.push({
        id: `e-spouse-${selectedNodeId}-${newNodeId}`,
        source: selectedNodeId,
        target: newNodeId,
        type: 'spouse',
        style: { stroke: '#ec4899', strokeWidth: 3, strokeDasharray: '6 6' },
      });
      alert(`✅ Spouse added.`);
    } else if (type === 'parent') {
      // When adding parent, new node above selected node, position will be recalculated during layout
      newEdges.push({ id: `e${newNodeId}-${selectedNodeId}`, source: newNodeId, target: selectedNodeId, type: 'parent_child' });
      alert(`✅ Parent added. Applying layout...`);
    } else return;

    const updatedNodes = [...nodes, newNode];
    applyLayoutAndLevels(updatedNodes, newEdges, runLayout, false);

    setSelectedNodeId(newNodeId);
  },
  [selectedNodeId, nodes, edges, applyLayoutAndLevels]
);


  const handleManualSave = async () => {
    takeSnapshot(nodes, edges); // Debounced internally, saves only updated nodes
    alert('✅ Tree saved successfully!');
  };

  const handleTagToggle = (tag) => {
    if (tag === '') {
      setSelectedTags([]);
    } else {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    }
  };

  const handleApplyLayout = useCallback(() => {
    applyLayoutAndLevels(nodes, edges, true, false);
    alert('✅ Layout re-applied successfully! Manual positions are preserved.');
  }, [nodes, edges, applyLayoutAndLevels]);

  const handleExport = async (type) => {
    try {
      const flowElement = document.querySelector('.react-flow');
      if (!flowElement) return;
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
      flowElement.style.transform = originalTransform;
      flowElement.style.transformOrigin = '';
      const imgData = canvas.toDataURL('image/png');
      if (type === 'png') {
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `${treeId}-family-tree-${Date.now()}.png`;
        link.click();
      } else if (type === 'pdf') {
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${treeId}-family-tree-${Date.now()}.pdf`);
      }
      alert(`✅ Tree exported as ${type.toUpperCase()} successfully!`);
    } catch (error) {
      console.error('Error exporting tree:', error);
      alert('❌ Failed to export tree. Please try again.');
    }
  };

  useEffect(() => {
    const dobSet = new Set(), dobMonthSet = new Set(), dobDaySet = new Set();
    const annSet = new Set(), annMonthSet = new Set(), annDaySet = new Set();
    nodes.forEach(node => {
      if (node.data?.dob && /^\d{2}-\d{2}-\d{4}$/.test(node.data.dob)) {
        const [d, m, y] = node.data.dob.split('-');
        if (y) dobSet.add(y);
        if (y === selectedYear && m) dobMonthSet.add(m);
        if (y === selectedYear && m === selectedMonth && d) dobDaySet.add(d);
      }
      if (node.data?.anniversary && /^\d{2}-\d{2}-\d{4}$/.test(node.data.anniversary)) {
        const [d, m, y] = node.data.anniversary.split('-');
        if (y) annSet.add(y);
        if (y === selectedAnnYear && m) annMonthSet.add(m);
        if (selectedAnnYear && m === selectedAnnMonth && d) annDaySet.add(d);
      }
    });
    setDobYears(Array.from(dobSet).sort());
    setDobMonths(Array.from(dobMonthSet).sort());
    setDobDays(Array.from(dobDaySet).sort());
    setAnnYears(Array.from(annSet).sort());
    setAnnMonths(Array.from(annMonthSet).sort());
    setAnnDays(Array.from(annDaySet).sort());
  }, [nodes, selectedYear, selectedMonth, selectedAnnYear, selectedAnnMonth]);

  const nodesForRender = useMemo(() => {
    return nodes.filter(node => {
      if (selectedYear || selectedMonth || selectedDay) {
        if (!node.data?.dob) return false;
        const [d, m, y] = node.data.dob.split('-');
        if (selectedYear && y !== selectedYear) return false;
        if (selectedMonth && m !== selectedMonth) return false;
        if (selectedDay && d !== selectedDay) return false;
      }
      if (selectedAnnYear || selectedAnnMonth || selectedAnnDay) {
        if (!node.data?.anniversary) return false;
        const [d, m, y] = node.data.anniversary.split('-');
        if (selectedAnnYear && y !== selectedAnnYear) return false;
        if (selectedAnnMonth && m !== selectedAnnMonth) return false;
        if (selectedAnnDay && d !== selectedAnnDay) return false;
      }
      return true;
    }).map(node => {
      const renderPosition = node.positionAbsolute || node.position;
      return { ...node, position: renderPosition, data: { ...node.data, selectedTags } };
    });
  }, [nodes, selectedTags, selectedYear, selectedMonth, selectedDay, selectedAnnYear, selectedAnnMonth, selectedAnnDay]);

  if (loading || !treeId || !user) {
    return (
      <div className="flex justify-center items-center h-screen text-xl font-semibold text-indigo-700">
        {!user ? "Redirecting to Sign In..." : "Loading Family Tree..."}
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header/Controls */}
        <div className="bg-white shadow-md p-3 flex-shrink-0 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-indigo-700">Family Tree Map: <span className="text-green-600">{treeId}</span></h1>
          <div className="flex items-center space-x-4">

            <button
              onClick={() => navigate('/')}
              className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-300 transition-colors"
              title="Go back to the family tree selector"
            >
              ← Change Tree
            </button>

            <Auth />

            {/* Tag Filter Dropdown */}
            <div className="relative">
              <select
                onChange={(e) => handleTagToggle(e.target.value)}
                value={selectedTags.length > 0 ? selectedTags[selectedTags.length - 1] : ''}
                className="bg-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
              >
                <option value="">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag} className={selectedTags.includes(tag) ? 'bg-indigo-100 font-bold' : ''}>
                    {tag} {selectedTags.includes(tag) ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
              {selectedTags.length > 0 && (
                <div className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center p-1 cursor-pointer"
                  onClick={() => setSelectedTags([])}
                  title="Clear All Filters"
                >
                  {selectedTags.length}
                </div>
              )}
            </div>

            {/* Excel-style DOB filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs">DOB:</span>
              <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedMonth(''); setSelectedDay(''); }} className="text-xs">
                <option value="">All Years</option>
                {dobYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {selectedYear &&
                <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setSelectedDay(''); }} className="text-xs">
                  <option value="">All Months</option>
                  {dobMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              }
              {selectedMonth &&
                <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} className="text-xs">
                  <option value="">All Days</option>
                  {dobDays.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              }
            </div>
            {/* Excel-style Anniversary filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs">Ann:</span>
              <select value={selectedAnnYear} onChange={e => { setSelectedAnnYear(e.target.value); setSelectedAnnMonth(''); setSelectedAnnDay(''); }} className="text-xs">
                <option value="">All Years</option>
                {annYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {selectedAnnYear &&
                <select value={selectedAnnMonth} onChange={e => { setSelectedAnnMonth(e.target.value); setSelectedAnnDay(''); }} className="text-xs">
                  <option value="">All Months</option>
                  {annMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              }
              {selectedAnnMonth &&
                <select value={selectedAnnDay} onChange={e => setSelectedAnnDay(e.target.value)} className="text-xs">
                  <option value="">All Days</option>
                  {annDays.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              }
            </div>

            {/* Add Node Buttons */}
            <div className='flex space-x-2 border-r pr-4'>
              <button
                onClick={() => addNode('child')}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
                title={selectedNodeId ? `Add Child to ${selectedNode?.data.label}` : "Select a node first"}
                disabled={!selectedNodeId}
              >
                + Child
              </button>
              <button
                onClick={() => addNode('spouse')}
                className="bg-pink-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-pink-700 transition-colors"
                title={selectedNodeId ? `Add Spouse to ${selectedNode?.data.label}` : "Select a node first"}
                disabled={!selectedNodeId}
              >
                + Spouse
              </button>
              <button
                onClick={() => addNode('parent')}
                className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 transition-colors"
                title={selectedNodeId ? `Add Parent to ${selectedNode?.data.label}` : "Select a node first"}
                disabled={!selectedNodeId}
              >
                + Parent
              </button>
            </div>

            {/* History Controls */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${canUndo ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
              title="Undo Last Action (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${canRedo ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
              title="Redo Undone Action (Ctrl+Y)"
            >
              Redo
            </button>

            {/* Apply Layout Button */}
            <button
              onClick={handleApplyLayout}
              className="bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-indigo-600 transition-colors"
              title="Recalculate and apply the hierarchical layout"
            >
              Apply Layout
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <select
                onChange={(e) => e.target.value && handleExport(e.target.value)}
                className="bg-indigo-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2.5 hover:bg-indigo-700"
              >
                <option value="">Export Tree</option>
                <option value="png">Export as PNG</option>
                <option value="pdf">Export as PDF</option>
              </select>
            </div>

            {/* Manual Save Button */}
            <button
              onClick={handleManualSave}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors"
              title="Manually save to Firestore (Auto-save is also active)"
            >
              Save Now
            </button>
          </div>
        </div>

        {/* Main ReactFlow Canvas and Properties Pane */}
        <div className="flex flex-1 min-h-0">

          {/* ReactFlow Canvas */}
          <div className="flex-1 min-h-full">
            <ReactFlow
              nodes={nodesForRender}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesState}
              nodeTypes={nodeTypes}
              fitView
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              defaultEdgeOptions={{
                animated: false,
                style: { stroke: '#4f46e5', strokeWidth: 3 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#4f46e5' },
              }}
              edgeTypes={{ parent_child: SmoothStepEdge, spouse: SmoothStepEdge }}
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
            Viewing Tree: <strong>{treeId}</strong> | Total Members: <strong>{nodes.length}</strong> | Connections: <strong>{edges.length}</strong>
          </div>
          <div className="flex gap-4">
            <span>💡 Tip: Click any node to select it and edit properties on the right pane</span>
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
};

export default TreeView;
