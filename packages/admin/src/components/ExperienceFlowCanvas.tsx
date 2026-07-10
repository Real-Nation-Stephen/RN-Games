import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ExperienceGraph, ExperienceNodeOverrides, FlowNode } from "@rngames/shared";
import { graphToLinearSteps, linearStepsToGraph } from "@rngames/shared";
import { ItemPicker, type PickerModule } from "./ItemPicker";
import "./ExperienceFlowCanvas.css";

type FlowNodeData = {
  label: string;
  sublabel?: string;
  nodeKind: "entry" | "exit" | "module" | "logic";
  moduleInstanceId?: string;
  moduleType?: string;
  overrides?: ExperienceNodeOverrides;
  warnings?: string[];
};

function EntryNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className="flow-node flow-node--entry">
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ExitNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className="flow-node flow-node--exit">
      <Handle type="target" position={Position.Top} />
      <strong>{data.label}</strong>
    </div>
  );
}

function ModuleNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`flow-node flow-node--module${data.warnings?.length ? " flow-node--warn" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <strong>{data.label}</strong>
      {data.sublabel ? <span className="flow-node-sub">{data.sublabel}</span> : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function LogicNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className="flow-node flow-node--logic">
      <Handle type="target" position={Position.Top} />
      <strong>{data.label}</strong>
      <span className="flow-node-sub">Passthrough only (rules in Wave 4)</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  entry: EntryNode,
  exit: ExitNode,
  module: ModuleNode,
  logic: LogicNode,
};

function newStepId() {
  return `step-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function graphToRfNodes(
  graph: ExperienceGraph,
  moduleLabel: (moduleInstanceId: string, moduleType: string, label?: string) => string,
  warningsByStepId: Map<string, string[]>,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];
  const gNodes = graph.nodes || [];
  const gEdges = graph.edges || [];

  for (const n of gNodes) {
    if (n.kind === "control") {
      const ct = n.controlType;
      if (ct === "entry") {
        nodes.push({
          id: n.id,
          type: "entry",
          position: n.position || { x: 200, y: 0 },
          data: { label: "Start", nodeKind: "entry" },
          draggable: false,
        });
      } else if (ct === "exit") {
        nodes.push({
          id: n.id,
          type: "exit",
          position: n.position || { x: 200, y: 400 },
          data: { label: "End", nodeKind: "exit" },
          draggable: false,
        });
      } else if (ct === "logic") {
        nodes.push({
          id: n.id,
          type: "logic",
          position: n.position || { x: 200, y: 200 },
          data: { label: n.label || "Logic", nodeKind: "logic" },
        });
      }
    } else if (n.kind === "module") {
      const label = moduleLabel(n.moduleInstanceId, n.moduleType, n.label);
      nodes.push({
        id: n.id,
        type: "module",
        position: n.position || { x: 200, y: 100 },
        data: {
          label: label.split(" — ")[0] || "Component",
          sublabel: label.includes("—") ? label.split("—").slice(1).join("—").trim() : n.moduleType,
          nodeKind: "module",
          moduleInstanceId: n.moduleInstanceId,
          moduleType: n.moduleType,
          overrides: n.overrides,
          warnings: warningsByStepId.get(n.id),
        },
      });
    }
  }

  for (const e of gEdges) {
    edges.push({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      label: e.label,
    });
  }

  return { nodes, edges };
}

function rfToGraph(nodes: Node<FlowNodeData>[], edges: Edge[]): ExperienceGraph {
  const flowNodes: FlowNode[] = [];
  for (const n of nodes) {
    if (n.type === "entry") {
      flowNodes.push({
        kind: "control",
        id: n.id,
        controlType: "entry",
        position: n.position,
      });
    } else if (n.type === "exit") {
      flowNodes.push({
        kind: "control",
        id: n.id,
        controlType: "exit",
        position: n.position,
      });
    } else if (n.type === "logic") {
      flowNodes.push({
        kind: "control",
        id: n.id,
        controlType: "logic",
        position: n.position,
        label: n.data.label,
      });
    } else if (n.type === "module") {
      flowNodes.push({
        kind: "module",
        id: n.id,
        position: n.position,
        moduleInstanceId: n.data.moduleInstanceId || "",
        moduleType: n.data.moduleType || "",
        label: n.data.label,
        overrides: n.data.overrides,
      });
    }
  }

  return {
    nodes: flowNodes,
    edges: edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
    entryNodeId: "entry",
  };
}

function disconnectNode(graph: ExperienceGraph, nodeId: string): ExperienceGraph {
  if (nodeId === "entry" || nodeId === "exit") return graph;
  const edges = [...(graph.edges || [])];
  const incoming = edges.find((e) => e.targetNodeId === nodeId);
  const outgoing = edges.find((e) => e.sourceNodeId === nodeId);
  if (!incoming && !outgoing) return graph;
  const newEdges = edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
  if (incoming && outgoing) {
    newEdges.push({
      id: `e-${incoming.sourceNodeId}-${outgoing.targetNodeId}`,
      sourceNodeId: incoming.sourceNodeId,
      targetNodeId: outgoing.targetNodeId,
    });
  }
  const nodes = (graph.nodes || []).filter((n) => n.id !== nodeId);
  return { ...graph, nodes, edges: newEdges };
}

function insertModuleAfter(graph: ExperienceGraph, afterNodeId: string, mod: PickerModule): ExperienceGraph {
  const steps = graphToLinearSteps(graph);
  const i = steps.findIndex((s) => s.id === afterNodeId);
  const newStep = {
    id: newStepId(),
    moduleInstanceId: mod.id,
    moduleType: mod.gameType || "spinning-wheel",
    label: mod.title,
  };
  if (i < 0) return insertModuleInChain(graph, mod);
  const next = [...steps];
  next.splice(i + 1, 0, newStep);
  let result = linearStepsToGraph(next);
  const logicNodes = (graph.nodes || []).filter((n) => n.kind === "control" && n.controlType === "logic");
  for (const ln of logicNodes) {
    if (result.nodes.some((n) => n.id === ln.id)) continue;
    result = insertLogicStub(result);
  }
  return result;
}

function insertModuleInChain(graph: ExperienceGraph, mod: PickerModule): ExperienceGraph {
  const steps = graphToLinearSteps(graph);
  const newStep = {
    id: newStepId(),
    moduleInstanceId: mod.id,
    moduleType: mod.gameType || "spinning-wheel",
    label: mod.title,
  };
  return linearStepsToGraph([...steps, newStep]);
}

function insertLogicStub(graph: ExperienceGraph): ExperienceGraph {
  const nodes = [...(graph.nodes || [])];
  const edges = [...(graph.edges || [])];
  const logicId = `logic-${Date.now().toString(36)}`;
  const exitNode = nodes.find((n) => n.kind === "control" && n.controlType === "exit");
  const exitId = exitNode?.id || "exit";
  const incoming = edges.find((e) => e.targetNodeId === exitId);
  if (!incoming) return graph;

  const y = (exitNode?.position?.y || 400) - 80;
  nodes.push({
    kind: "control",
    id: logicId,
    controlType: "logic",
    position: { x: 200, y },
    label: "Logic",
  });

  const newEdges = edges.filter((e) => e.id !== incoming.id);
  newEdges.push({
    id: `e-${incoming.sourceNodeId}-${logicId}`,
    sourceNodeId: incoming.sourceNodeId,
    targetNodeId: logicId,
  });
  newEdges.push({
    id: `e-${logicId}-${exitId}`,
    sourceNodeId: logicId,
    targetNodeId: exitId,
  });

  return { ...graph, nodes, edges: newEdges };
}

function removeNodeFromChain(graph: ExperienceGraph, nodeId: string): ExperienceGraph {
  if (nodeId === "entry" || nodeId === "exit") return graph;
  const node = graph.nodes?.find((n) => n.id === nodeId);
  if (node?.kind === "control" && node.controlType === "logic") {
    const edges = graph.edges || [];
    const inEdge = edges.find((e) => e.targetNodeId === nodeId);
    const outEdge = edges.find((e) => e.sourceNodeId === nodeId);
    if (!inEdge || !outEdge) return graph;
    const newEdges = edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
    newEdges.push({
      id: `e-${inEdge.sourceNodeId}-${outEdge.targetNodeId}`,
      sourceNodeId: inEdge.sourceNodeId,
      targetNodeId: outEdge.targetNodeId,
    });
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => n.id !== nodeId),
      edges: newEdges,
    };
  }
  const steps = graphToLinearSteps(graph).filter((s) => s.id !== nodeId);
  return linearStepsToGraph(steps);
}

type Props = {
  graph: ExperienceGraph;
  modules: PickerModule[];
  warnings: { stepId: string; message: string }[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onChange: (graph: ExperienceGraph) => void;
};

export function ExperienceFlowCanvas({
  graph,
  modules,
  warnings,
  selectedNodeId,
  onSelectNode,
  onChange,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [insertAfterNodeId, setInsertAfterNodeId] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "pan">("select");

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);

  const moduleLabel = useCallback(
    (moduleInstanceId: string, moduleType: string, label?: string) => {
      const m = moduleById.get(moduleInstanceId);
      if (!m) return label || "— select component —";
      return `${m.title} (${m.gameType || moduleType}) — /${m.slug}`;
    },
    [moduleById],
  );

  const warningsByStepId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const w of warnings) {
      const list = map.get(w.stepId) || [];
      list.push(w.message);
      map.set(w.stepId, list);
    }
    return map;
  }, [warnings]);

  const initial = useMemo(
    () => graphToRfNodes(graph, moduleLabel, warningsByStepId),
    [graph, moduleLabel, warningsByStepId],
  );

  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);

  useEffect(() => {
    const next = graphToRfNodes(graph, moduleLabel, warningsByStepId);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [graph, moduleLabel, warningsByStepId]);

  const emitGraph = useCallback(
    (nextNodes: Node<FlowNodeData>[], nextEdges: Edge[]) => {
      onChange(rfToGraph(nextNodes, nextEdges));
    },
    [onChange],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<FlowNodeData>>[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        emitGraph(next, edges);
        return next;
      });
    },
    [edges, emitGraph],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        emitGraph(nodes, next);
        return next;
      });
    },
    [nodes, emitGraph],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const nextEdges = addEdge(
        { ...connection, id: `e-${connection.source}-${connection.target}` },
        edges.filter((e) => e.source !== connection.source),
      );
      setEdges(nextEdges);
      emitGraph(nodes, nextEdges);
    },
    [nodes, edges, emitGraph],
  );

  const onNodeDragStop = useCallback(() => {
    emitGraph(nodes, edges);
  }, [nodes, edges, emitGraph]);

  function handleAddModule(mod: PickerModule) {
    const next = insertAfterNodeId
      ? insertModuleAfter(graph, insertAfterNodeId, mod)
      : insertModuleInChain(graph, mod);
    onChange(next);
    setShowPicker(false);
    setInsertAfterNodeId(null);
  }

  function handleDisconnectSelected() {
    if (!selectedNodeId) return;
    onChange(disconnectNode(graph, selectedNodeId));
    onSelectNode(null);
  }

  function handleAddLogic() {
    onChange(insertLogicStub(graph));
  }

  function handleRemoveSelected() {
    if (!selectedNodeId) return;
    onChange(removeNodeFromChain(graph, selectedNodeId));
    onSelectNode(null);
  }

  function handleMoveSelected(dir: -1 | 1) {
    if (!selectedNodeId) return;
    const steps = graphToLinearSteps(graph);
    const i = steps.findIndex((s) => s.id === selectedNodeId);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const reordered = [...steps];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    onChange(linearStepsToGraph(reordered));
  }

  const selectedModule = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId && n.type === "module")
    : null;

  return (
    <div className="experience-flow">
      <div className="experience-flow-toolbar">
        <button
          type="button"
          className={`btn${tool === "select" ? " btn-primary" : ""}`}
          onClick={() => setTool("select")}
          title="Select and move nodes"
        >
          Select
        </button>
        <button
          type="button"
          className={`btn${tool === "pan" ? " btn-primary" : ""}`}
          onClick={() => setTool("pan")}
          title="Pan the canvas"
        >
          Pan
        </button>
        <span className="experience-flow-toolbar-sep" aria-hidden="true" />
        <button type="button" className="btn btn-primary" onClick={() => setShowPicker((v) => !v)}>
          {showPicker ? "Close palette" : "Add component"}
        </button>
        <button type="button" className="btn" onClick={handleAddLogic}>
          Add logic stub
        </button>
        {selectedNodeId && selectedNodeId !== "entry" && selectedNodeId !== "exit" ? (
          <>
            <button type="button" className="btn" onClick={() => handleMoveSelected(-1)}>
              Move up
            </button>
            <button type="button" className="btn" onClick={() => handleMoveSelected(1)}>
              Move down
            </button>
            <button type="button" className="btn" onClick={handleDisconnectSelected}>
              Disconnect
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setInsertAfterNodeId(selectedNodeId);
                setShowPicker(true);
              }}
            >
              Insert after
            </button>
            <button type="button" className="btn" onClick={handleRemoveSelected}>
              Remove node
            </button>
          </>
        ) : null}
      </div>

      {showPicker ? (
        <div className="experience-flow-picker">
          <ItemPicker
            mode="module"
            heading="Add component to flow"
            modules={modules}
            onPickModule={handleAddModule}
          />
        </div>
      ) : null}

      <div className="experience-flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => onSelectNode(n.id)}
          onPaneClick={() => onSelectNode(null)}
          onNodeDragStop={onNodeDragStop}
          fitView
          panOnDrag={tool === "pan"}
          selectionOnDrag={tool === "select"}
          nodesDraggable={tool === "select"}
          nodesConnectable={tool === "select"}
          elementsSelectable={tool === "select"}
          nodesFocusable
          elevateNodesOnSelect
          minZoom={0.4}
          maxZoom={1.5}
        >
          <Background gap={16} color="rgba(255,255,255,0.06)" />
          <Controls />
        </ReactFlow>
      </div>

      {selectedModule ? (
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
          Selected: <strong>{selectedModule.data.label}</strong>
          {selectedModule.data.warnings?.length ? (
            <span style={{ color: "#ffb4b4" }}> — {selectedModule.data.warnings.join("; ")}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
