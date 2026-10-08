import { User, Role, Level } from "../contexts/AuthContext.tsx";

export const Action = {
  // Accounts
  MANAGE_ACCOUNTS: "MANAGE_ACCOUNTS",

  // Engineering & BOM
  MANAGE_BOM: "MANAGE_BOM",
  CREATE_PR_ENGINEERING: "CREATE_PR_ENGINEERING",
  VIEW_BOM: "VIEW_BOM",
  VIEW_DESIGN_REQUESTS: "VIEW_DESIGN_REQUESTS",

  // Production
  CREATE_PR_PRODUCTION: "CREATE_PR_PRODUCTION",
  CONSUME_MATERIAL: "CONSUME_MATERIAL",
  VIEW_PRODUCTION_ACTION: "VIEW_PRODUCTION_ACTION",
  MANAGE_PRODUCTION_CONFIG: "MANAGE_PRODUCTION_CONFIG",
  VIEW_PRODUCTION: "VIEW_PRODUCTION",

  // Procurement / Purchasing
  CREATE_PO: "CREATE_PO",
  MANAGE_VENDORS: "MANAGE_VENDORS",
  MANAGE_PRICING: "MANAGE_PRICING",
  AUTH_PR: "AUTH_PR",
  AUTH_PR_URGENT: "AUTH_PR_URGENT",
  VIEW_VENDORS: "VIEW_VENDORS",
  VIEW_PRICING: "VIEW_PRICING",
  VIEW_PROCUREMENT: "VIEW_PROCUREMENT",

  // Warehouse / Inventory
  RECEIVE_PO: "RECEIVE_PO",
  DISPATCH_GOODS: "DISPATCH_GOODS",
  VIEW_LOW_STOCK: "VIEW_LOW_STOCK",
  WAREHOUSE_ACTION: "WAREHOUSE_ACTION",
  VIEW_WAREHOUSE: "VIEW_WAREHOUSE",

  // Sales & Deliveries
  MANAGE_CUSTOMERS: "MANAGE_CUSTOMERS",
  AUTH_DELIVERY: "AUTH_DELIVERY",
  SALES_ACTION: "SALES_ACTION",
  CREATE_DELIVERY: "CREATE_DELIVERY",
  VIEW_CUSTOMERS: "VIEW_CUSTOMERS",
  VIEW_DELIVERIES: "VIEW_DELIVERIES",
  VIEW_INVOICES: "VIEW_INVOICES",
  VIEW_QUOTATIONS: "VIEW_QUOTATIONS",
  MANAGE_INVOICES: "MANAGE_INVOICES",
  VIEW_MASTER_DATA: "VIEW_MASTER_DATA",
  VIEW_FINANCE: "VIEW_FINANCE",
  MANAGE_FINANCE: "MANAGE_FINANCE",
  CREATE_QUOTATION: "CREATE_QUOTATION",
} as const;

export type Action = keyof typeof Action;

interface PBACContext {
  resourceId?: string;
  projectStatus?: string;
  ownerId?: string;
  [key: string]: any;
}

const GOD_MODE_USERS = ["eghy", "ludy"];

export function getRolePolicies(): Record<Role, Action[]> {
  return {
    FC: Object.values(Action) as Action[],
    ENGINEERING: [
      Action.MANAGE_BOM,
      Action.CREATE_PR_ENGINEERING,
      Action.AUTH_PR,
      Action.AUTH_PR_URGENT,
      Action.WAREHOUSE_ACTION,
      Action.VIEW_BOM,
      Action.VIEW_DESIGN_REQUESTS,
      Action.VIEW_WAREHOUSE,
    ],
    PURCHASING: [
      Action.CREATE_PO,
      Action.MANAGE_VENDORS,
      Action.MANAGE_PRICING,
      Action.VIEW_LOW_STOCK,
      Action.VIEW_VENDORS,
      Action.VIEW_PRICING,
      Action.VIEW_PROCUREMENT,
      Action.VIEW_MASTER_DATA,
    ],
    WAREHOUSE: [
      Action.RECEIVE_PO,
      Action.DISPATCH_GOODS,
      Action.VIEW_LOW_STOCK,
      Action.WAREHOUSE_ACTION,
      Action.CREATE_DELIVERY,
      Action.CONSUME_MATERIAL,
      Action.VIEW_WAREHOUSE,
      Action.VIEW_DELIVERIES,
    ],
    PRODUCTION: [
      Action.CREATE_PR_PRODUCTION,
      Action.CONSUME_MATERIAL,
      Action.VIEW_PRODUCTION_ACTION,
      Action.MANAGE_PRODUCTION_CONFIG,
      Action.VIEW_PRODUCTION,
      Action.VIEW_WAREHOUSE,
    ],
    SALES: [
      Action.MANAGE_CUSTOMERS,
      Action.AUTH_DELIVERY,
      Action.SALES_ACTION,
      Action.CREATE_DELIVERY,
      Action.VIEW_CUSTOMERS,
      Action.VIEW_DELIVERIES,
      Action.VIEW_INVOICES,
      Action.VIEW_QUOTATIONS,
      Action.CREATE_QUOTATION,
      Action.MANAGE_INVOICES,
      Action.VIEW_MASTER_DATA,
    ],
    HR: [Action.VIEW_MASTER_DATA],
  };
}

export function hasGodMode(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    GOD_MODE_USERS.includes(user.username.toLowerCase()) || user.role === "FC"
  );
}

export const ACTIONS_REQUIRING_MANAGER: Action[] = [
  Action.AUTH_PR,
  Action.AUTH_PR_URGENT,
  Action.AUTH_DELIVERY,
  Action.MANAGE_VENDORS,
  Action.MANAGE_PRICING,
  Action.MANAGE_CUSTOMERS,
  Action.MANAGE_INVOICES,
  Action.MANAGE_PRODUCTION_CONFIG,
  Action.MANAGE_BOM,
  Action.SALES_ACTION,
];

export function hasPermission(
  user: User | null | undefined,
  action: Action,
  context?: PBACContext,
): boolean {
  if (!user) return false;

  // 1. Check God Mode overrides everything
  if (hasGodMode(user)) {
    return true;
  }

  // 2. Base role permissions
  const rolePolicies = getRolePolicies();

  const allowedActions = rolePolicies[user.role] || [];
  if (!allowedActions.includes(action)) return false;

  // 3. Level-based PBAC restrictions (e.g. staff cannot perform Manager-restricted actions)
  if (ACTIONS_REQUIRING_MANAGER.includes(action) && user.level !== "MANAGER") {
    return false;
  }

  // 4. Optional contextual PBAC rules (e.g. only modify if project status is DRAFT)
  if (context) {
    if (
      action === Action.MANAGE_BOM &&
      context.projectStatus &&
      context.projectStatus !== "DRAFT" &&
      context.projectStatus !== "ACTIVE"
    ) {
      return false; // Engineering cannot modify BOM if project is completed
    }
  }

  return true;
}
