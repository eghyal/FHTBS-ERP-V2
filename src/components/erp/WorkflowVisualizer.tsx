import React, { useMemo } from "react";
import { ReactFlow, Controls, Background, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export default function WorkflowVisualizer({ matrices }: { matrices: any[] }) {
  const { nodes, edges } = useMemo(() => {
    const nds: Node[] = [];
    const eds: Edge[] = [];

    // Group matrices by document_type
    const byDocType = matrices.reduce(
      (acc, curr) => {
        acc[curr.document_type] = acc[curr.document_type] || [];
        acc[curr.document_type].push(curr);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    let yOffset = 0;

    Object.keys(byDocType).forEach((docType, docIdx) => {
      const docs = byDocType[docType].sort(
        (a: any, b: any) => a.min_amount - b.min_amount,
      );
      let xOffset = 50;
      const startNodeId = `start-${docType}`;

      // Start Node
      nds.push({
        id: startNodeId,
        position: { x: xOffset, y: yOffset + 50 },
        data: { label: `${docType} Created` },
        type: "input",
        style: {
          background: "#f8fafc",
          color: "#334155",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          fontWeight: "bold",
        },
      });

      let prevId = startNodeId;

      docs.forEach((matrix: any, i: number) => {
        xOffset += 250;
        const condition = `Amount > ${matrix.min_amount.toLocaleString()}`;

        // Node for each Matrix step
        const nodeId = `matrix-${matrix.id}`;
        nds.push({
          id: nodeId,
          position: { x: xOffset, y: yOffset },
          data: {
            label: (
              <div className="text-xs">
                <div className="font-bold border-b border-indigo-200 pb-1 mb-1 text-indigo-900">
                  {condition}
                </div>
                <div className="text-[10px] text-indigo-700">
                  Approvers:{" "}
                  {matrix.roles.join(matrix.is_parallel ? " AND " : " OR ")}
                </div>
              </div>
            ),
          },
          style: {
            background: "#e0e7ff",
            border: "1px solid #818cf8",
            borderRadius: "8px",
            width: 200,
          },
        });

        // Edge linking them
        eds.push({
          id: `e-${prevId}-${nodeId}`,
          source: prevId,
          target: nodeId,
          animated: true,
          style: { stroke: "#6366f1" },
        });

        prevId = nodeId;
      });

      // End Node
      xOffset += 250;
      nds.push({
        id: `end-${docType}`,
        position: { x: xOffset, y: yOffset + 50 },
        data: { label: "Final Approval" },
        type: "output",
        style: {
          background: "#f0fdf4",
          color: "#166534",
          border: "1px solid #86efac",
          borderRadius: "8px",
          fontWeight: "bold",
        },
      });
      eds.push({
        id: `e-${prevId}-end-${docType}`,
        source: prevId,
        target: `end-${docType}`,
        animated: true,
        style: { stroke: "#22c55e" },
      });

      yOffset += 150; // Spacing for next Document Type lane
    });

    return { nodes: nds, edges: eds };
  }, [matrices]);

  return (
    <div
      style={{ height: 600, width: "100%" }}
      className="rounded-3xl border border-stone-200 overflow-hidden bg-stone-50"
    >
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
