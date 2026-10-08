/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { MotionConfig, AnimatePresence, motion } from "motion/react";
import Layout from "@/components/layouts/Layout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Loader } from "@/components/shared/Loader";
import { AuthProvider, useAuth, Role } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ShareProvider } from "./contexts/ShareContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AttendanceReminder } from "@/components/shared/AttendanceReminder";
import { useOfflineSyncStore } from "@/stores/useOfflineSyncStore";

// Helper to handle dynamic chunk load retries when Vite updates bundles
function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    let lastError: any = null;
    const retryDelays = [300, 800, 1500];

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        return await factory();
      } catch (error: any) {
        lastError = error;
        const isChunkError =
          error?.message?.includes("Failed to fetch dynamically imported module") ||
          error?.message?.includes("Importing a module script failed") ||
          error?.name === "ChunkLoadError" ||
          String(error).includes("dynamically imported module");

        if (isChunkError) {
          if (attempt < retryDelays.length) {
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
            continue;
          }

          // Hard reload on final chunk load error if not recently reloaded
          const reloadKey = "chunk_lazy_retry_" + window.location.pathname;
          const lastRetry = sessionStorage.getItem(reloadKey);
          const now = Date.now();
          if (!lastRetry || now - Number(lastRetry) > 8000) {
            sessionStorage.setItem(reloadKey, String(now));
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        } else {
          // If not a chunk error, rethrow immediately
          throw error;
        }
      }
    }
    throw lastError;
  });
}

// Lazy load pages
const Overview = lazyRetry(() => import("./pages/erp/core/Overview"));
const Quotations = lazyRetry(() => import("./pages/erp/sales/Quotations"));
const DataCenter = lazyRetry(() => import("./pages/erp/admin/DataCenter"));
const Production = lazyRetry(() => import("./pages/erp/production/Production"));
const ManPower = lazyRetry(() => import("./pages/erp/production/ManPower"));
const Procurement = lazyRetry(() => import("./pages/erp/procurement/Procurement"));
const Engineering = lazyRetry(() => import("./pages/erp/production/Engineering"));
const BopEngineeringPage = lazyRetry(() => import("./pages/erp/production/BopEngineeringPage"));
const Requests = lazyRetry(() => import("./pages/erp/production/Requests"));
const ProjectDetails = lazyRetry(() => import("./pages/erp/production/ProjectDetails"));
const ProjectProductionHub = lazyRetry(() => import("./pages/erp/production/ProjectProductionHub"));
const ShopFloorTerminal = lazyRetry(() => import("./pages/erp/production/terminal/ShopFloorTerminal"));
const Customers = lazyRetry(() => import("./pages/erp/sales/Customers"));
const Deliveries = lazyRetry(() => import("./pages/erp/sales/Deliveries"));
const Pricing = lazyRetry(() => import("./pages/erp/procurement/Pricing"));
const Warehouse = lazyRetry(() => import("./pages/erp/inventory/Warehouse"));
const Vendors = lazyRetry(() => import("./pages/erp/procurement/Vendors"));
const Logs = lazyRetry(() => import("./pages/erp/admin/Logs"));
const Login = lazyRetry(() => import("./pages/auth/Login"));
const Forum = lazyRetry(() => import("./pages/erp/core/Forum"));
const ManageAccounts = lazyRetry(() => import("./pages/erp/admin/ManageAccounts"));
const CloudMigrationHub = lazyRetry(() => import("./pages/erp/admin/CloudMigrationHub"));
const Workflow = lazyRetry(() => import("./pages/erp/admin/Workflow"));
const Invoices = lazyRetry(() => import("./pages/erp/sales/Invoices"));
const Payables = lazyRetry(() => import("./pages/erp/finance/Payables"));
const Payroll = lazyRetry(() => import("./pages/erp/finance/Payroll"));
const Finance = lazyRetry(() => import("./pages/erp/finance/Finance"));
const GeneralLedger = lazyRetry(() => import("./pages/erp/finance/GeneralLedger"));
const ReceivablesAging = lazyRetry(() => import("./pages/erp/finance/ReceivablesAging"));
const CashflowForecasting = lazyRetry(() => import("./pages/erp/finance/CashflowForecasting"));
const ImportData = lazyRetry(() => import("./pages/erp/admin/ImportData"));
const HumanResource = lazyRetry(() => import("./pages/hris/HumanResource"));
const EmployeeSelfService = lazyRetry(
  () => import("./pages/hris/EmployeeSelfService"),
);
const PublicHome = lazyRetry(() => import("./pages/public/PublicHome"));
const Careers = lazyRetry(() => import("./pages/public/Careers"));
const Shop = lazyRetry(() => import("./pages/public/Shop"));
const ShopManagement = lazyRetry(() => import("./pages/erp/sales/ShopManagement"));
const PotentialCustomers = lazyRetry(() => import("./pages/erp/sales/PotentialCustomers"));
const AnnualEvent = lazyRetry(() => import("./pages/erp/admin/AnnualEvent"));
const HrLogin = lazyRetry(() => import("./pages/auth/HrLogin"));

import HrLayout from "@/components/layouts/HrLayout";
import { Action, hasGodMode, hasPermission } from "./utils/pbac";

function ProtectedRoute({
  children,
  requiredAction,
  fcOnly,
}: {
  children: React.ReactNode;
  requiredAction?: Action;
  fcOnly?: boolean;
}) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (hasGodMode(user)) return <>{children}</>;

  if (fcOnly) {
    if (!hasGodMode(user)) {
      return <Navigate to="/erp" replace />;
    }
  }

  if (requiredAction) {
    if (!hasPermission(user, requiredAction)) {
      return <Navigate to="/erp" replace />;
    }
  }

  return <>{children}</>;
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Unauthenticated / Public Routes */}
        <Route
          path="/"
          element={
            <Suspense fallback={<Loader fullScreen text="Loading..." />}>
              <PageWrapper>
                <PublicHome />
              </PageWrapper>
            </Suspense>
          }
        />
        <Route
          path="/careers"
          element={
            <Suspense fallback={<Loader fullScreen text="Loading..." />}>
              <PageWrapper>
                <Careers />
              </PageWrapper>
            </Suspense>
          }
        />
        <Route
          path="/shop"
          element={
            <Suspense fallback={<Loader fullScreen text="Loading Shop..." />}>
              <PageWrapper>
                <Shop />
              </PageWrapper>
            </Suspense>
          }
        />
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={user.role === "HR" ? "/hr" : "/erp"} replace />
            ) : (
              <Suspense
                fallback={<Loader fullScreen text="Loading Session..." />}
              >
                <PageWrapper>
                  <Login />
                </PageWrapper>
              </Suspense>
            )
          }
        />
        <Route
          path="/hr-login"
          element={
            user ? (
              <Navigate to="/hr" replace />
            ) : (
              <Suspense
                fallback={<Loader fullScreen text="Loading HR Session..." />}
              >
                <PageWrapper>
                  <HrLogin />
                </PageWrapper>
              </Suspense>
            )
          }
        />

        {/* Standalone Protected HR Portal */}
        <Route
          path="/hr"
          element={
            !user ? (
              <Navigate to="/hr-login" replace />
            ) : user.role !== "HR" && !hasGodMode(user) ? (
              <Navigate to="/erp" replace />
            ) : (
              <HrLayout>
                <ErrorBoundary>
                  <Suspense fallback={<Loader text="Loading HR Portal..." />}>
                    <PageWrapper>
                      <HumanResource />
                    </PageWrapper>
                  </Suspense>
                </ErrorBoundary>
              </HrLayout>
            )
          }
        />
        <Route
          path="/hr/*"
          element={
            !user ? (
              <Navigate to="/hr-login" replace />
            ) : user.role !== "HR" && !hasGodMode(user) ? (
              <Navigate to="/erp" replace />
            ) : (
              <HrLayout>
                <ErrorBoundary>
                  <Suspense fallback={<Loader text="Loading HR Portal..." />}>
                    <PageWrapper>
                      <HumanResource />
                    </PageWrapper>
                  </Suspense>
                </ErrorBoundary>
              </HrLayout>
            )
          }
        />
        <Route path="/hris" element={<Navigate to="/hr" replace />} />
        <Route path="/hris/*" element={<Navigate to="/hr" replace />} />

        {/* Protected ERP Paths */}
        <Route
          path="/*"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : (
              <Layout>
                <ErrorBoundary>
                  <Suspense fallback={<Loader text="Loading Module..." />}>
                    <Routes>
                      <Route
                        path="/erp"
                        element={
                          <PageWrapper>
                            <Overview />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/ess"
                        element={
                          <PageWrapper>
                            <EmployeeSelfService />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/quotations"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_QUOTATIONS}
                          >
                            <PageWrapper>
                              <Quotations />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/shop-management"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_QUOTATIONS}
                          >
                            <PageWrapper>
                              <ShopManagement />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/potential-customers"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_QUOTATIONS}
                          >
                            <PageWrapper>
                              <PotentialCustomers />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/annual-event"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.MANAGE_ACCOUNTS}
                          >
                            <PageWrapper>
                              <AnnualEvent />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/data-center"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_MASTER_DATA}
                          >
                            <PageWrapper>
                              <DataCenter />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/import"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_MASTER_DATA}
                          >
                            <PageWrapper>
                              <ImportData />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                          >
                            <PageWrapper>
                              <Production />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production/manpower"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                          >
                            <PageWrapper>
                              <ManPower />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/production/project/:id"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                          >
                            <PageWrapper>
                              <ProjectProductionHub />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/shopfloor"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PRODUCTION}
                          >
                            <PageWrapper>
                              <ShopFloorTerminal />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/project/:id"
                        element={
                          <PageWrapper>
                            <ProjectDetails />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/procurement"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_PROCUREMENT}
                          >
                            <PageWrapper>
                              <Procurement />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/engineering"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_BOM}>
                            <PageWrapper>
                              <Engineering />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/engineering/bop"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_BOM}>
                            <PageWrapper>
                              <BopEngineeringPage />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/requests"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_DESIGN_REQUESTS}
                          >
                            <PageWrapper>
                              <Requests />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/pricing"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_PRICING}>
                            <PageWrapper>
                              <Pricing />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/warehouse"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_WAREHOUSE}
                          >
                            <PageWrapper>
                              <Warehouse />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/customers"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_CUSTOMERS}
                          >
                            <PageWrapper>
                              <Customers />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/deliveries"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.VIEW_DELIVERIES}
                          >
                            <PageWrapper>
                              <Deliveries />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/invoices"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_INVOICES}>
                            <PageWrapper>
                              <Invoices />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/payables"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_FINANCE}>
                            <PageWrapper>
                              <Payables />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/payroll"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_FINANCE}>
                            <PageWrapper>
                              <Payroll />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/finance"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_FINANCE}>
                            <PageWrapper>
                              <Finance />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/general-ledger"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_FINANCE}>
                            <PageWrapper>
                              <GeneralLedger />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ar-aging"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_FINANCE}>
                            <PageWrapper>
                              <ReceivablesAging />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/cashflow-forecast"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_FINANCE}>
                            <PageWrapper>
                              <CashflowForecasting />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/vendors"
                        element={
                          <ProtectedRoute requiredAction={Action.VIEW_VENDORS}>
                            <PageWrapper>
                              <Vendors />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/forum"
                        element={
                          <PageWrapper>
                            <Forum />
                          </PageWrapper>
                        }
                      />
                      <Route
                        path="/logs"
                        element={
                          <ProtectedRoute fcOnly>
                            <PageWrapper>
                              <Logs />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/workflow"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.MANAGE_ACCOUNTS}
                          >
                            <PageWrapper>
                              <Workflow />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/manage-accounts"
                        element={
                          <ProtectedRoute
                            requiredAction={Action.MANAGE_ACCOUNTS}
                          >
                            <PageWrapper>
                              <ManageAccounts />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/cloud-migration"
                        element={
                          <ProtectedRoute fcOnly>
                            <PageWrapper>
                              <CloudMigrationHub />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/migration"
                        element={
                          <ProtectedRoute fcOnly>
                            <PageWrapper>
                              <CloudMigrationHub />
                            </PageWrapper>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="*"
                        element={<Navigate to="/erp" replace />}
                      />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </Layout>
            )
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function PageTitleManager() {
  const location = useLocation();

  useEffect(() => {
    const { pathname } = location;

    // Public routes: /, /login, /hr-login, /careers, /careers/*
    if (
      pathname === "/" ||
      pathname === "/login" ||
      pathname === "/hr-login" ||
      pathname === "/careers" ||
      pathname.startsWith("/careers/")
    ) {
      document.title = "Paving Joss";
      return;
    }

    // HRIS routes: /hr, /hr/*, /ess, /ess/*
    if (
      pathname === "/hr" ||
      pathname.startsWith("/hr/") ||
      pathname === "/ess" ||
      pathname.startsWith("/ess/")
    ) {
      document.title = "HRIS - Paving Joss";
      return;
    }

    // ERP routes: all other internal operations (/erp, /quotations, /production, /warehouse, etc.)
    document.title = "ERP - Paving Joss";
  }, [location.pathname]);

  return null;
}

function OfflineSyncManager() {
  const { loadQueue, setOfflineStatus } = useOfflineSyncStore();
  
  useEffect(() => {
    loadQueue();
    const handleOnline = () => setOfflineStatus(false);
    const handleOffline = () => setOfflineStatus(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadQueue, setOfflineStatus]);
  
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <NotificationProvider>
          <ToastProvider>
            <ShareProvider>
              <MotionConfig reducedMotion="user">
                <BrowserRouter>
                  <PageTitleManager />
                  <OfflineSyncManager />
                  <AnimatedRoutes />
                  <AttendanceReminder />
                </BrowserRouter>
              </MotionConfig>
            </ShareProvider>
          </ToastProvider>
        </NotificationProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
