import { apiFetch } from "@/utils/api";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
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
  EmptyState,
} from "@/components/ui";
import {
  Shield,
  Briefcase,
  UserCheck,
  Trash2,
  Edit2,
  Save,
  X,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  hasGodMode,
  getRolePolicies,
  Action,
  ACTIONS_REQUIRING_MANAGER,
} from "@/utils/pbac";
import { Role } from "@/contexts/AuthContext";

interface Account {
  id: string;
  username: string;
  name: string;
  role: string;
  level: string;
  status: string;
  created_at: string;
}

export default function ManageAccounts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [pendingAccounts, setPendingAccounts] = useState<Account[]>([]);
  const [activeAccounts, setActiveAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [editLevel, setEditLevel] = useState<string>("STAFF");

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
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
    if (!hasGodMode(user)) {
      navigate("/");
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      const [pendingRes, activeRes] = await Promise.all([
        apiFetch("/api/auth/pending", {}, user?.username),
        apiFetch("/api/users/all", {}, user?.username),
      ]);

      if (pendingRes.ok) setPendingAccounts(pendingRes.data || []);
      if (activeRes.ok) setActiveAccounts(activeRes.data || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch accounts", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (id: string, action: "approve" | "reject") => {
    try {
      const endpoint =
        action === "approve" ? "/api/auth/approve" : "/api/auth/reject";
      const res = await apiFetch(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({ id }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          `Account ${action === "approve" ? "approved" : "rejected"} successfully`,
          "success",
        );
        fetchData();
      } else {
        showToast(res.error || `Failed to ${action} account`, "error");
      }
    } catch (err) {
      console.error(err);
      showToast(`Error ${action}ing account`, "error");
    }
  };

  const startEdit = (acc: Account) => {
    setEditingId(acc.id);
    setEditRole(acc.role);
    setEditLevel(acc.level || "STAFF");
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await apiFetch(
        `/api/users/${id}/role`,
        {
          method: "PUT",
          body: JSON.stringify({ role: editRole, level: editLevel }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Role & Level updated successfully", "success");
        setEditingId(null);
        fetchData();
      } else {
        showToast(res.error || "Failed to update credentials", "error");
      }
    } catch (e) {
      showToast("Error updating credentials", "error");
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Account",
      message:
        "Are you sure you want to delete this account? This action cannot be undone.",
      onConfirm: async () => {
        try {
          const res = await apiFetch(
            `/api/users/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Account deleted successfully", "success");
            fetchData();
          } else {
            showToast(res.error || "Failed to delete account", "error");
          }
        } catch (e) {
          showToast("Error deleting account", "error");
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  if (!hasGodMode(user)) return null;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Access Control"
        subtitle="User accounts and role access"
        icon={<ShieldCheck className="w-6 h-6" />}
      />

      {isLoading ? (
        <Loader text="Loading accounts..." className="py-20" />
      ) : (
        <div className="space-y-8">
          {/* Pending Approval Section */}
          <Card>
            <CardHeader
              title="Pending Approvals"
              subtitle="Review and authorize account registrations"
              icon={<Shield className="w-4 h-4" />}
              actions={
                <Badge variant="warning" dot>
                  {pendingAccounts.length} Pending
                </Badge>
              }
            />

            {pendingAccounts.length === 0 ? (
              <EmptyState
                icon={<Shield className="w-6 h-6" />}
                title="No pending requests"
                description="All registration requests have been approved or rejected."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant Details</TableHead>
                    <TableHead>Requested Role</TableHead>
                    <TableHead className="text-center">Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-500 shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 text-sm truncate">
                              {account.name}
                            </div>
                            <div className="text-xs text-stone-500 font-mono truncate">
                              @{account.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="neutral">{account.role}</Badge>
                          {account.role !== "FC" && (
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                              [ {account.level || "STAFF"} ]
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs font-mono text-stone-500 tabular-nums">
                        {new Date(account.created_at).toLocaleDateString("en-US")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="xs"
                            variant="danger_soft"
                            onClick={() => handleAction(account.id, "reject")}
                          >
                            Reject
                          </Button>
                          <Button
                            size="xs"
                            variant="success_soft"
                            onClick={() => handleAction(account.id, "approve")}
                          >
                            Approve
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Active Accounts Section */}
          <Card>
            <CardHeader
              title="Active Users"
              subtitle="Configured personnel with authenticated system access"
              icon={<UserCheck className="w-4 h-4" />}
              actions={
                <Badge variant="success" dot>
                  {activeAccounts.length} Active
                </Badge>
              }
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Details</TableHead>
                  <TableHead>Role & Level</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAccounts.length === 0 ? (
                  <TableEmpty colSpan={4} message="No active users found." />
                ) : (
                  activeAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-500 shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 text-sm truncate">
                              {account.name}
                            </div>
                            <div className="text-xs text-stone-500 font-mono truncate">
                              @{account.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingId === account.id ? (
                          <div className="space-y-2 max-w-sm">
                            <Select
                              value={editRole}
                              onChange={(e) => {
                                const r = e.target.value;
                                setEditRole(r);
                                if (r === "FC") {
                                  setEditLevel("MANAGER");
                                }
                              }}
                              className="py-1.5 text-xs w-full"
                              icon={<Briefcase className="w-3.5 h-3.5" />}
                            >
                              <option value="FC">Full Control (FC)</option>
                              <option value="HR">Human Resource (HR)</option>
                              <option value="ENGINEERING">Engineering</option>
                              <option value="PURCHASING">Purchasing</option>
                              <option value="WAREHOUSE">Warehouse</option>
                              <option value="PRODUCTION">Production</option>
                              <option value="SALES">Sales</option>
                            </Select>

                            {editRole !== "FC" && (
                              <Select
                                value={editLevel}
                                onChange={(e) => setEditLevel(e.target.value)}
                                className="py-1.5 text-xs w-full"
                                icon={
                                  <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
                                }
                              >
                                <option value="STAFF">Staff</option>
                                <option value="MANAGER">Manager</option>
                              </Select>
                            )}

                            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80">
                              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                                <span>Policy Preview</span>
                                {editLevel === "MANAGER" && (
                                  <Badge variant="success" size="sm">
                                    Manager Access
                                  </Badge>
                                )}
                                {editRole === "FC" && (
                                  <Badge variant="danger" size="sm">
                                    God Mode
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(
                                  getRolePolicies()[editRole as Role] || []
                                ).map((action) => {
                                  const isManagerAction =
                                    ACTIONS_REQUIRING_MANAGER.includes(
                                      action as Action,
                                    );

                                  if (
                                    isManagerAction &&
                                    editLevel !== "MANAGER" &&
                                    editRole !== "FC"
                                  ) {
                                    return null;
                                  }

                                  return (
                                    <span
                                      key={action}
                                      className={`px-1.5 py-0.5 border text-[9px] font-mono rounded uppercase ${
                                        isManagerAction
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          : "bg-white text-stone-600 border-stone-200"
                                      }`}
                                    >
                                      {action.replace(/_/g, " ")}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant={account.role === "FC" ? "primary" : "neutral"}>
                              {account.role}
                            </Badge>
                            {account.role !== "FC" && (
                              <Badge variant="default" size="sm">
                                {account.level || "STAFF"}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            account.status === "APPROVED" ? "success" : "neutral"
                          }
                          dot
                        >
                          {account.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {editingId === account.id ? (
                            <>
                              <Button
                                size="xs"
                                variant="success_soft"
                                onClick={() => saveEdit(account.id)}
                                title="Save"
                              >
                                <Save className="w-3.5 h-3.5" /> Save
                              </Button>
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => setEditingId(null)}
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" /> Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => startEdit(account)}
                                disabled={
                                  account.role === "FC" &&
                                  account.username !== user?.username &&
                                  user?.username.toLowerCase() !== "eghy" &&
                                  user?.username.toLowerCase() !== "ludy"
                                }
                                title="Edit Role"
                              >
                                <Edit2 className="w-3.5 h-3.5" /> Edit
                              </Button>
                              <Button
                                size="xs"
                                variant="danger_soft"
                                onClick={() => handleDelete(account.id)}
                                disabled={account.username === user.username}
                                title="Delete Account"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        confirmText={confirmModal.title.includes("Reset") ? "Reset" : "Delete"}
        isDestructive
      />

      {/* Danger Zone */}
      <Card className="border-rose-200/80 bg-rose-50/20">
        <CardHeader
          title="Danger Zone"
          subtitle="Irreversible system maintenance actions"
          icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-2">
          <div>
            <h4 className="font-bold text-stone-900 text-sm">
              Full Factory Reset (ERP & HRIS)
            </h4>
            <p className="text-stone-500 text-xs mt-0.5">
              Wipes all projects, transactions, inventory, social feeds, and HRIS data while preserving user accounts.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmModal({
                isOpen: true,
                title: "Full Factory Reset",
                message:
                  "CRITICAL: This will permanently delete ALL transactional, master, and HR data from the entire system. ONLY user accounts will remain. This action is IRREVERSIBLE. Are you absolutely certain?",
                onConfirm: async () => {
                  try {
                    const resFactory = await apiFetch(
                      "/api/admin/reset-factory",
                      { method: "POST" },
                      user?.username,
                    );
                    const resHr = await apiFetch(
                      "/api/admin/reset-hris",
                      { method: "POST" },
                      user?.username,
                    );

                    if (resFactory.ok && resHr.ok) {
                      showToast(
                        "Full Factory reset successful. System is now clean.",
                        "success",
                      );
                      setTimeout(() => window.location.reload(), 2000);
                    } else {
                      showToast(
                        resFactory.error || resHr.error || "Failed to perform reset",
                        "error",
                      );
                    }
                  } catch (e) {
                    showToast("Error performing reset", "error");
                  } finally {
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  }
                },
              });
            }}
          >
            <AlertTriangle className="w-4 h-4" /> Reset All Data
          </Button>
        </div>
      </Card>
    </div>
  );
}
