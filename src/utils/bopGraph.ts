// Utility for analyzing Bill of Processes (BOP) Directed Acyclic Graph (DAG)
// Handles Precedence, Sequential Lineage (A -> B), and Parallel Branch Detection (A // C)

export interface BopStepGraphNode {
  id: string;
  process_name?: string;
  name?: string;
  predecessor_ids?: string[] | string;
  node_type?: string;
  step_sequence?: number;
  [key: string]: any;
}

export interface BopDAG {
  nodesMap: Map<string, BopStepGraphNode>;
  adjacencyList: Map<string, string[]>; // stepId -> successors (downstream steps)
  predecessorsList: Map<string, string[]>; // stepId -> predecessors (upstream steps)
}

/**
 * Parses predecessor IDs from raw field (handles JSON string, array, or empty values)
 */
export function parsePredecessorIds(raw: string[] | string | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Builds directed graph structures (adjacency and predecessor lists) from BOP steps
 */
export function buildBopDAG(steps: BopStepGraphNode[]): BopDAG {
  const nodesMap = new Map<string, BopStepGraphNode>();
  const adjacencyList = new Map<string, string[]>();
  const predecessorsList = new Map<string, string[]>();

  // Initialize
  steps.forEach((step) => {
    nodesMap.set(step.id, step);
    adjacencyList.set(step.id, []);
    predecessorsList.set(step.id, []);
  });

  // Populate edges
  steps.forEach((step) => {
    const preds = parsePredecessorIds(step.predecessor_ids);
    predecessorsList.set(step.id, preds);

    preds.forEach((predId) => {
      if (adjacencyList.has(predId)) {
        adjacencyList.get(predId)!.push(step.id);
      }
    });
  });

  return { nodesMap, adjacencyList, predecessorsList };
}

/**
 * Checks if targetId is reachable from startId going downstream along the successor edges (startId -> ... -> targetId)
 */
export function isReachableDownstream(startId: string, targetId: string, dag: BopDAG): boolean {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const queue: string[] = [startId];
  let guard = 0;

  while (queue.length > 0 && guard < 1000) {
    guard++;
    const current = queue.shift()!;
    if (current === targetId && current !== startId) return true;

    if (!visited.has(current)) {
      visited.add(current);
      const successors = dag.adjacencyList.get(current) || [];
      for (const succ of successors) {
        if (succ === targetId) return true;
        if (!visited.has(succ)) {
          queue.push(succ);
        }
      }
    }
  }

  return false;
}

export type BopRelationType = "SAME" | "SEQUENTIAL_DOWNSTREAM" | "SEQUENTIAL_UPSTREAM" | "PARALLEL";

export interface BopRelationshipResult {
  relationType: BopRelationType;
  isAllowedForMultitask: boolean;
  stepAName: string;
  stepBName: string;
  description: string;
}

/**
 * Analyzes relationship between two BOP steps:
 * - A -> B (Sequential Downstream): Manpower in A can multitask to B (auto-pausing A).
 * - B -> A (Sequential Upstream): Manpower in B can multitask to A.
 * - A // C (Parallel/Independent): Manpower in A CANNOT be assigned to C simultaneously.
 */
export function getBopRelationship(stepAId: string, stepBId: string, allSteps: BopStepGraphNode[]): BopRelationshipResult {
  if (stepAId === stepBId) {
    const step = allSteps.find(s => s.id === stepAId);
    const name = step?.process_name || step?.name || stepAId;
    return {
      relationType: "SAME",
      isAllowedForMultitask: false,
      stepAName: name,
      stepBName: name,
      description: `Langkah yang sama (${name})`,
    };
  }

  const dag = buildBopDAG(allSteps);
  const stepA = dag.nodesMap.get(stepAId);
  const stepB = dag.nodesMap.get(stepBId);

  const stepAName = stepA?.process_name || stepA?.name || stepAId;
  const stepBName = stepB?.process_name || stepB?.name || stepBId;

  // Check if A is ancestor of B (A -> ... -> B)
  const isADownstreamToB = isReachableDownstream(stepAId, stepBId, dag);
  if (isADownstreamToB) {
    return {
      relationType: "SEQUENTIAL_DOWNSTREAM",
      isAllowedForMultitask: true,
      stepAName,
      stepBName,
      description: `Rangkaian Berurutan (${stepAName} ➔ ${stepBName})`,
    };
  }

  // Check if B is ancestor of A (B -> ... -> A)
  const isBDownstreamToA = isReachableDownstream(stepBId, stepAId, dag);
  if (isBDownstreamToA) {
    return {
      relationType: "SEQUENTIAL_UPSTREAM",
      isAllowedForMultitask: true,
      stepAName,
      stepBName,
      description: `Rangkaian Berurutan (${stepBName} ➔ ${stepAName})`,
    };
  }

  // Neither is reachable from the other -> Parallel / Independent branch
  return {
    relationType: "PARALLEL",
    isAllowedForMultitask: false,
    stepAName,
    stepBName,
    description: `Proses Paralel Independen (${stepAName} // ${stepBName})`,
  };
}

export interface ManpowerSequentialValidation {
  isValid: boolean;
  conflictType: "NONE" | "SAME_STEP" | "PARALLEL_CONFLICT";
  conflictStepName?: string;
  sequentialStepName?: string;
  message: string;
}

/**
 * Validates if an operator already assigned to certain steps can take on a target step
 */
export function validateManpowerSequentialAssignment(
  targetBopId: string,
  existingAssignedBopIds: string[],
  allSteps: BopStepGraphNode[]
): ManpowerSequentialValidation {
  if (existingAssignedBopIds.length === 0) {
    return {
      isValid: true,
      conflictType: "NONE",
      message: "Operator tersedia untuk penugasan.",
    };
  }

  const targetStep = allSteps.find(s => s.id === targetBopId);
  const targetName = targetStep?.process_name || targetStep?.name || targetBopId;

  for (const existingId of existingAssignedBopIds) {
    const relation = getBopRelationship(existingId, targetBopId, allSteps);

    if (relation.relationType === "SAME") {
      return {
        isValid: false,
        conflictType: "SAME_STEP",
        conflictStepName: relation.stepAName,
        message: `Operator sudah ditugaskan pada proses "${relation.stepAName}". Tidak perlu penugasan ganda.`,
      };
    }

    if (relation.relationType === "PARALLEL") {
      return {
        isValid: false,
        conflictType: "PARALLEL_CONFLICT",
        conflictStepName: relation.stepAName,
        message: `Operator tidak dapat ditugaskan pada proses "${targetName}" karena sudah ditugaskan pada proses paralel "${relation.stepAName}". Operator hanya diizinkan merangkap pada tahapan berurutan (Sequential Lineage: A ➔ B).`,
      };
    }
  }

  const firstExisting = allSteps.find(s => s.id === existingAssignedBopIds[0]);
  const existingName = firstExisting?.process_name || firstExisting?.name || existingAssignedBopIds[0];

  return {
    isValid: true,
    conflictType: "NONE",
    sequentialStepName: existingName,
    message: `Penugasan multi-tahap berurutan (${existingName} ➔ ${targetName}) diizinkan. Proses sebelumnya akan otomatis dijeda saat operator aktif di proses ini untuk memaksimalkan efisiensi tenaga kerja.`,
  };
}
