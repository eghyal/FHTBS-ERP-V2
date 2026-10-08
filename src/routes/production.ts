import { Router } from "express";
import { ndpRouter } from "./production/ndp_routes.ts";
import { manpowerRouter } from "./production/manpower_routes.ts";
import { planningRouter } from "./production/planning_routes.ts";
import { bopRouter } from "./production/bop_routes.ts";
import { analyticsRouter } from "./production/analytics_routes.ts";
import { executionRouter } from "./production/execution_routes.ts";

export const router = Router();

router.use(ndpRouter);
router.use(manpowerRouter);
router.use(planningRouter);
router.use(bopRouter);
router.use(analyticsRouter);
router.use(executionRouter);
