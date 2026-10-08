import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Workflow,
  Network,
  Clock,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  SplitSquareHorizontal,
  Zap,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  Select,
  Input,
  EmptyState,
} from "@/components/ui";

import WorkflowVisualizer from "@/components/erp/WorkflowVisualizer";

export default function WorkflowSettings() {
  const [activeTab, setActiveTab] = useState<
    "MATRIX" | "SLA" | "HEIJUNKA" | "AUDIT" | "VISUAL"
  >("MATRIX");
  const { showToast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const [matrices, setMatrices] = useState<any[]>([]);
  const [slas, setSlas] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [heijunkaThreshold, setHeijunkaThreshold] = useState<string>("5000000");

  const [confirmModalOptions, setConfirmModalOptions] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchRules();
    fetchAudit();
  }, []);

  const fetchAudit = async () => {
    try {
      const res = await apiFetch(
        "/api/workflow/audit_logs",
        {},
        user?.username,
      );
      if (res.ok) setAuditLogs(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRules = async () => {
    try {
      setLoading(true);
      const mRes = await apiFetch("/api/workflow/matrices", {}, user?.username);
      const sRes = await apiFetch("/api/workflow/slas", {}, user?.username);
      const hRes = await apiFetch("/api/lean/heijunka/threshold", {}, user?.username);
      
      if (mRes.ok) setMatrices(mRes.data || []);
      if (sRes.ok) setSlas(sRes.data || []);
      if (hRes.ok && hRes.data?.threshold !== undefined) {
        setHeijunkaThreshold(hRes.data.threshold.toString());
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch workflow rules", "error");
    } finally {
      setLoading(false);
    }
  };

  const addMatrix = () => {
    setMatrices([
      {
        id: Date.now().toString(),
        document_type: "Purchase Order",
        min_amount: 0,
        max_amount: null,
        roles: [],
        is_parallel: 0,
        is_new: true,
      },
      ...matrices,
    ]);
  };

  const removeMatrix = async (id: string, isNew?: boolean) => {
    setConfirmModalOptions({
      isOpen: true,
      title: "Delete Matrix Rule",
      message: "Are you sure you want to delete this matrix rule?",
      onConfirm: async () => {
        setConfirmModalOptions((prev) => ({ ...prev, isOpen: false }));
        if (isNew) {
          setMatrices(matrices.filter((m) => m.id !== id));
          return;
        }
        try {
          const res = await apiFetch(
            `/api/workflow/matrices/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) fetchRules();
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const addSla = () => {
    setSlas([
      {
        id: Date.now().toString(),
        document_type: "Purchase Order",
        step: "Pending Approval",
        sla_hours: 24,
        escalate_to: "Director",
        is_new: true,
      },
      ...slas,
    ]);
  };

  const removeSla = async (id: string, isNew?: boolean) => {
    setConfirmModalOptions({
      isOpen: true,
      title: "Delete SLA",
      message: "Are you sure you want to delete this SLA?",
      onConfirm: async () => {
        setConfirmModalOptions((prev) => ({ ...prev, isOpen: false }));
        if (isNew) {
          setSlas(slas.filter((s) => s.id !== id));
          return;
        }
        try {
          const res = await apiFetch(
            `/api/workflow/slas/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) fetchRules();
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const saveSettings = async () => {
    for (let m of matrices) {
      const res = await apiFetch(
        "/api/workflow/matrices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(m),
        },
        user?.username,
      );
      if (!res.ok) {
        showToast("Failed to save some matrix rules", "error");
        return;
      }
    }

    for (let s of slas) {
      const res = await apiFetch(
        "/api/workflow/slas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        },
        user?.username,
      );
      if (!res.ok) {
        showToast("Failed to save SLA rules", "error");
        return;
      }
    }
    
    try {
      const parsedThreshold = parseInt(heijunkaThreshold.replace(/\D/g, ""), 10) || 0;
      await apiFetch(
        "/api/lean/heijunka/threshold",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threshold: parsedThreshold }),
        },
        user?.username,
      );
    } catch (e) {
      console.error("Failed to save heijunka threshold", e);
    }

    showToast(
      "Workflow automation settings have been successfully updated.",
      "success",
    );
    fetchRules();
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Workflow & Automation"
        subtitle="Approval matrix, SLA escalation, and Heijunka fast-track"
        icon={<Workflow className="w-6 h-6" />}
        actions={
          <Button
            variant="primary"
            onClick={saveSettings}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Apply Engine Rules</span>
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl w-fit border border-stone-200/60 overflow-x-auto custom-scrollbar">
        {[
          { id: "MATRIX", label: "Dynamic Approval", icon: Network },
          { id: "SLA", label: "SLA & Escalation", icon: Clock },
          { id: "HEIJUNKA", label: "Heijunka Fast-Track", icon: Zap },
          { id: "AUDIT", label: "Audit Trail", icon: ShieldAlert },
          { id: "VISUAL", label: "BPMN Canvas", icon: Network },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.id as "MATRIX" | "SLA" | "HEIJUNKA" | "AUDIT" | "VISUAL",
                )
              }
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap",
                isActive
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.15 }}
      >
        {activeTab === "MATRIX" ? (
          <div className="space-y-6">
            <Card className="bg-emerald-50/40 border-emerald-200/80">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Network className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">
                    Dynamic Multi-Tier Approval Matrix
                  </h3>
                  <p className="text-xs text-emerald-800/90 leading-relaxed mt-0.5 font-medium">
                    Documents automatically route to specific roles based on transaction value. Multi-role sequences must be digitally signed before progress to the next ERP stage.
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Value-Based Hierarchy Rules"
                subtitle="Configure value thresholds and authorized signers"
                icon={<SlidersHorizontal className="w-4 h-4" />}
                actions={
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={addMatrix}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Rule
                  </Button>
                }
              />

              <div className="space-y-4">
                {matrices.map((matrix, idx) => (
                  <div
                    key={matrix.id}
                    className="grid grid-cols-12 gap-3 items-center bg-stone-50 border border-stone-200/70 p-4 rounded-xl"
                  >
                    <div className="col-span-12 md:col-span-3">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mb-1 block">
                        Doc Type
                      </label>
                      <Select
                        value={matrix.document_type}
                        onChange={(e) => {
                          const newM = [...matrices];
                          newM[idx] = {
                            ...newM[idx],
                            document_type: e.target.value,
                          };
                          setMatrices(newM);
                        }}
                        className="py-1 text-xs"
                      >
                        <option value="Purchase Order">Purchase Order</option>
                        <option value="Purchase Request">Purchase Request</option>
                        <option value="Quotation">Quotation</option>
                      </Select>
                    </div>

                    <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mb-1 block">
                          Min Value (Rp)
                        </label>
                        <Input
                          type="number"
                          value={matrix.min_amount}
                          onChange={(e) => {
                            const newM = [...matrices];
                            newM[idx] = {
                              ...newM[idx],
                              min_amount: parseFloat(e.target.value) || 0,
                            };
                            setMatrices(newM);
                          }}
                          className="py-1 text-xs font-mono tabular-nums"
                        />
                      </div>
                      <span className="mt-5 text-stone-400 font-bold">-</span>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mb-1 block">
                          Max Value (Rp)
                        </label>
                        <Input
                          type="text"
                          value={
                            matrix.max_amount === null
                              ? "Unlimited"
                              : matrix.max_amount
                          }
                          onChange={(e) => {
                            const newM = [...matrices];
                            newM[idx] = {
                              ...newM[idx],
                              max_amount:
                                e.target.value === "Unlimited" ||
                                e.target.value === ""
                                  ? null
                                  : parseFloat(e.target.value),
                            };
                            setMatrices(newM);
                          }}
                          className="py-1 text-xs font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block">
                          Signatures Sequence
                        </label>
                        <label className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={matrix.is_parallel === 1}
                            onChange={(e) => {
                              const newM = [...matrices];
                              newM[idx] = {
                                ...newM[idx],
                                is_parallel: e.target.checked ? 1 : 0,
                              };
                              setMatrices(newM);
                            }}
                            className="rounded text-emerald-600"
                          />
                          Parallel
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(matrix.roles || []).map(
                          (role: string, rIdx: number) => (
                            <React.Fragment key={`${role}-${rIdx}`}>
                              <span className="text-[11px] font-bold bg-stone-900 text-white px-2 py-1 rounded-md whitespace-nowrap flex items-center gap-1.5">
                                {role}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newM = [...matrices];
                                    const newRoles = [...newM[idx].roles];
                                    newRoles.splice(rIdx, 1);
                                    newM[idx] = {
                                      ...newM[idx],
                                      roles: newRoles,
                                    };
                                    setMatrices(newM);
                                  }}
                                  className="hover:text-rose-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                              {rIdx !== (matrix.roles || []).length - 1 &&
                                (matrix.is_parallel === 1 ? (
                                  <SplitSquareHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <ArrowRight className="w-3 h-3 text-stone-400" />
                                ))}
                            </React.Fragment>
                          ),
                        )}
                        <select
                          className="w-7 h-7 rounded border border-dashed border-stone-300 bg-white text-stone-500 text-xs font-bold text-center cursor-pointer hover:border-stone-400"
                          onChange={(e) => {
                            if (e.target.value) {
                              const newM = [...matrices];
                              newM[idx] = {
                                ...newM[idx],
                                roles: [
                                  ...(newM[idx].roles || []),
                                  e.target.value,
                                ],
                              };
                              setMatrices(newM);
                              e.target.value = "";
                            }
                          }}
                        >
                          <option value="">+</option>
                          <option value="Manager">Manager</option>
                          <option value="FC">FC (Full Control)</option>
                          <option value="Director">Director</option>
                          <option value="Procurement Manager">
                            Procurement Manager
                          </option>
                          <option value="Finance Manager">Finance Manager</option>
                          <option value="Engineering Lead">Engineering Lead</option>
                        </select>
                      </div>
                    </div>

                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      <Button
                        size="icon"
                        variant="danger_soft"
                        onClick={() => removeMatrix(matrix.id, matrix.is_new)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {matrices.length === 0 && (
                  <EmptyState
                    icon={<ShieldAlert className="w-6 h-6" />}
                    title="No matrix rules defined"
                    description="Transaction approvals are currently unrestricted across all roles."
                    action={
                      <Button size="xs" variant="primary" onClick={addMatrix}>
                        <Plus className="w-3.5 h-3.5" /> Add First Rule
                      </Button>
                    }
                  />
                )}
              </div>
            </Card>
          </div>
        ) : activeTab === "HEIJUNKA" ? (
          <div className="space-y-6">
            <Card className="bg-amber-50/40 border-amber-200/80">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-white border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-950">
                    Heijunka Fast-Track Operational Leveling
                  </h3>
                  <p className="text-xs text-amber-800/90 leading-relaxed mt-0.5 font-medium">
                    Automatically approves standard small-amount purchases without manual manager signatures to keep manufacturing floor lead times instant.
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Threshold Configuration"
                subtitle="Global fast-track financial boundary"
                icon={<Zap className="w-4 h-4" />}
              />
              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Fast-Track Approval Limit (IDR)
                  </label>
                  <Input
                    type="text"
                    value={parseInt(heijunkaThreshold.replace(/\D/g, "") || "0", 10).toLocaleString("id-ID")}
                    onChange={(e) => setHeijunkaThreshold(e.target.value)}
                    icon={<span className="text-xs font-bold text-stone-500">Rp</span>}
                    className="font-mono text-base font-bold tabular-nums"
                  />
                </div>

                <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-stone-900">Current Boundary</p>
                    <p className="text-[11px] text-stone-500">Auto-approves PR/PO below this value</p>
                  </div>
                  <Badge variant="warning" className="tabular-nums font-mono">
                    ≤ Rp {parseInt(heijunkaThreshold.replace(/\D/g, "") || "0", 10).toLocaleString("id-ID")}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        ) : activeTab === "SLA" ? (
          <div className="space-y-6">
            <Card className="bg-rose-50/40 border-rose-200/80">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-white border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-950">
                    SLA Bottleneck Auto-Escalation
                  </h3>
                  <p className="text-xs text-rose-800/90 leading-relaxed mt-0.5 font-medium">
                    Documents idle beyond standard SLA timeouts will automatically elevate to senior leadership for immediate intervention.
                  </p>
                </div>
              </div>
            </Card>

            <Card padding="none">
              <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Auto-Escalation Timeouts
                  </h3>
                  <p className="text-xs text-stone-500">
                    Configure maximum permissible idle duration per document step
                  </p>
                </div>
                <Button size="xs" variant="secondary" onClick={addSla}>
                  <Plus className="w-3.5 h-3.5" /> Add SLA
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Target Step</TableHead>
                    <TableHead>Max Idle</TableHead>
                    <TableHead>Escalate To</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slas.map((sla, idx) => (
                    <TableRow key={sla.id}>
                      <TableCell>
                        <Input
                          className="py-1 text-xs"
                          value={sla.document_type}
                          onChange={(e) => {
                            const newSlas = [...slas];
                            newSlas[idx] = {
                              ...newSlas[idx],
                              document_type: e.target.value,
                            };
                            setSlas(newSlas);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="py-1 text-xs"
                          value={sla.step}
                          onChange={(e) => {
                            const newSlas = [...slas];
                            newSlas[idx] = {
                              ...newSlas[idx],
                              step: e.target.value,
                            };
                            setSlas(newSlas);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 max-w-[120px]">
                          <Input
                            type="number"
                            className="py-1 text-xs font-mono tabular-nums text-right"
                            value={sla.sla_hours}
                            onChange={(e) => {
                              const newSlas = [...slas];
                              newSlas[idx] = {
                                ...newSlas[idx],
                                sla_hours: parseFloat(e.target.value) || 0,
                              };
                              setSlas(newSlas);
                            }}
                          />
                          <span className="text-xs text-stone-500 font-bold">hrs</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 max-w-[160px]">
                          <ArrowRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <Input
                            className="py-1 text-xs font-bold text-rose-700"
                            value={sla.escalate_to}
                            onChange={(e) => {
                              const newSlas = [...slas];
                              newSlas[idx] = {
                                ...newSlas[idx],
                                escalate_to: e.target.value,
                              };
                              setSlas(newSlas);
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="danger_soft"
                          onClick={() => removeSla(sla.id, sla.is_new)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {slas.length === 0 && (
                    <TableEmpty colSpan={5} message="No SLA escalation rules defined." />
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        ) : activeTab === "VISUAL" ? (
          <Card>
            <CardHeader
              title="BPMN Process Visualizer"
              subtitle="Live rendered directed acyclic graph (DAG) of the workflow pipeline"
              icon={<Network className="w-4 h-4" />}
            />
            <WorkflowVisualizer matrices={matrices} />
          </Card>
        ) : (
          <Card padding="none">
            <div className="p-4 sm:p-5 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">
                Workflow Rules Audit Trail
              </h3>
              <p className="text-xs text-stone-500">
                Historical record of configuration updates made to the automation engine
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs text-stone-500 tabular-nums whitespace-nowrap">
                      {new Date(log.created_at + "Z").toLocaleString()}
                    </TableCell>
                    <TableCell className="font-bold text-stone-800 text-xs">
                      {log.username}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action === "CREATE"
                            ? "success"
                            : log.action === "UPDATE"
                              ? "warning"
                              : "danger"
                        }
                        size="sm"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-stone-600">
                      {log.target_type} ({log.target_id?.split("-")?.shift()})
                    </TableCell>
                    <TableCell className="text-xs text-stone-500 max-w-xs truncate font-mono">
                      {log.changes}
                    </TableCell>
                  </TableRow>
                ))}
                {auditLogs.length === 0 && (
                  <TableEmpty colSpan={5} message="No workflow audit trails recorded." />
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </motion.div>

      <ConfirmModal
        isOpen={confirmModalOptions.isOpen}
        title={confirmModalOptions.title}
        message={confirmModalOptions.message}
        onConfirm={confirmModalOptions.onConfirm}
        onCancel={() =>
          setConfirmModalOptions((prev) => ({ ...prev, isOpen: false }))
        }
      />
    </div>
  );
}
