import { apiFetch } from "@/utils/api";
import React, { useEffect, useState, useMemo } from "react";
import {
  Search,
  User,
  Activity,
  Clock,
  Shield,
  ChevronLeft,
  ChevronRight,
  RotateCw,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  Input,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui";

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  created_at: string;
}

export default function Logs() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/audit-trail", {}, user?.username);
      if (res.ok) {
        setLogs(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch logs", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(
    () =>
      logs.filter(
        (log) =>
          log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.resource_id?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [logs, searchQuery],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("CREATE")) return "success";
    if (action.includes("DELETE") || action.includes("REJECT")) return "danger";
    if (action.includes("UPDATE") || action.includes("EDIT")) return "info";
    if (action.includes("AUTH") || action.includes("APPROVE")) return "purple";
    return "neutral";
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="System Logs"
        subtitle="Activity history and immutable audit trail"
        icon={<Activity className="w-6 h-6" />}
        actions={
          <Badge variant="success" dot className="px-3 py-1.5">
            <Shield className="w-3.5 h-3.5 mr-1" /> Monitored
          </Badge>
        }
      />

      <Card padding="none">
        <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-md w-full">
            <Input
              type="text"
              placeholder="Search by user, action, resource..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchLogs}
            isLoading={isLoading}
          >
            <RotateCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16">
                  <Loader text="Loading audit logs..." />
                </TableCell>
              </TableRow>
            ) : paginatedLogs.length === 0 ? (
              <TableEmpty
                colSpan={5}
                icon={<Activity className="w-6 h-6" />}
                message="No activity logs found matching the search criteria."
              />
            ) : (
              paginatedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      {new Date(log.created_at).toLocaleString("en-US", {
                        timeZone: "Asia/Jakarta",
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-stone-100 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-3 h-3 text-stone-500" />
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-stone-800 font-mono">
                        {log.user_email || "SYSTEM"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getActionBadgeVariant(log.action)} size="sm">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-bold text-stone-800">
                      {log.resource_type}
                    </div>
                    {log.resource_id && (
                      <div className="text-[11px] text-stone-400 font-mono tabular-nums truncate max-w-[180px]">
                        {log.resource_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-stone-600 max-w-md">
                    {log.details}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {!isLoading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/50 gap-3">
            <span className="text-xs text-stone-500 font-medium">
              Showing{" "}
              <span className="font-bold text-stone-800 tabular-nums">
                {(currentPage - 1) * itemsPerPage + 1}
              </span>{" "}
              to{" "}
              <span className="font-bold text-stone-800 tabular-nums">
                {Math.min(currentPage * itemsPerPage, filteredLogs.length)}
              </span>{" "}
              of{" "}
              <span className="font-bold text-stone-800 tabular-nums">
                {filteredLogs.length}
              </span>{" "}
              records
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </Button>
              <span className="px-2 text-xs font-semibold text-stone-600 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
