import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";

export const usersRouter = Router();

usersRouter.get(["/api/users", "/api/users/all"], requireRole(["FC", "ADMIN"]), (req, res) => {
  try {
    const users = db
      .prepare(
        "SELECT id, username, role, level, name, status, created_at FROM users WHERE status != 'PENDING' ORDER BY name ASC",
      )
      .all();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

usersRouter.put("/api/users/:id/role", requireRole(["FC"]), (req, res) => {
  try {
    const { role, level } = req.body;
    const targetUser = db
      .prepare("SELECT role FROM users WHERE id = ?")
      .get(req.params.id) as any;
    if (targetUser && targetUser.role === "FC") {
      return res
        .status(403)
        .json({ error: "Cannot modify Full Control accounts" });
    }
    db.prepare("UPDATE users SET role = ?, level = ? WHERE id = ?").run(
      role,
      level || "STAFF",
      req.params.id,
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update role" });
  }
});

usersRouter.delete("/api/users/:id", requireRole(["FC"]), (req, res) => {
  try {
    const userToDelete = db
      .prepare("SELECT username, role FROM users WHERE id = ?")
      .get(req.params.id) as any;
    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }
    if (userToDelete.role === "FC") {
      const fcCount = db
        .prepare(
          "SELECT COUNT(*) as count FROM users WHERE role = 'FC' AND status = 'APPROVED'",
        )
        .get() as { count: number };
      if (fcCount.count <= 1) {
        return res
          .status(403)
          .json({ error: "Cannot delete the last Full Control account" });
      }
    }
    db.transaction(() => {
      db.pragma("foreign_keys = OFF");
      const username = userToDelete.username;
      db.prepare("DELETE FROM chat_participants WHERE username = ?").run(
        username,
      );
      db.prepare("DELETE FROM user_drafts WHERE username = ?").run(
        username,
      );
      db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
      db.pragma("foreign_keys = ON");
    })();
    res.json({ success: true });
  } catch (e: any) {
    console.error("Delete user error:", e);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

usersRouter.get("/api/users/directory", (req, res) => {
  try {
    const users = db
      .prepare(
        "SELECT id, username, name, role, level, status FROM users WHERE status = 'APPROVED' OR status IS NULL OR status = '' OR status = 'ACTIVE'",
      )
      .all();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

usersRouter.put("/api/users/heartbeat", (req, res) => {
  try {
    const { device_type, username: bodyUsername } = req.body;
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"] ||
      bodyUsername) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    try {
      const result = db
        .prepare(
          `
      UPDATE users 
      SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), device_type = ?
      WHERE LOWER(username) = LOWER(?)
    `,
        )
        .run(device_type || "Desktop", username);

      if (result.changes === 0) {
        console.warn(
          `Heartbeat: User ${username} not found in database (attempted with case-insensitive match)`,
        );
      }
    } catch (e) {
      console.warn("Heartbeat update failed, attempting partial update:", e);
      try {
        db.prepare(
          `UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE LOWER(username) = LOWER(?)`,
        ).run(username);
      } catch (innerE) {
        console.error("Heartbeat update critically failed:", innerE);
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error("Heartbeat route error:", e);
    res.status(500).json({ error: "Failed to update heartbeat" });
  }
});

usersRouter.post("/api/users/logout", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"] ||
      req.body?.username) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    try {
      db.prepare(
        `UPDATE users SET last_seen_at = NULL WHERE LOWER(username) = LOWER(?)`,
      ).run(username);
    } catch (e) {
      console.error("Failed to clear last_seen_at on logout", e);
    }

    res.clearCookie("auth_token", { httpOnly: true, sameSite: "strict" });
    res.json({ success: true });
  } catch (e) {
    console.error("Logout route error:", e);
    res.status(500).json({ error: "Failed to process logout" });
  }
});

usersRouter.get("/api/users/status", (req, res) => {
  try {
    let users;
    try {
      users = db
        .prepare(
          `
      SELECT username, name, role, last_seen_at, device_type
      FROM users 
      WHERE status = 'APPROVED'
    `,
        )
        .all();
    } catch (e) {
      console.warn("User status primary query failed, trying secondary fallback:", e);
      try {
        users = db
          .prepare(
            `
        SELECT username, name, role, last_seen_at
        FROM users 
        WHERE status = 'APPROVED'
      `,
          )
          .all()
          .map((u: any) => ({ ...u, device_type: "Desktop" }));
      } catch (innerE) {
        console.warn("User status secondary query failed, trying final fallback:", innerE);
        users = db
          .prepare(
            `
        SELECT username, name, role
        FROM users 
        WHERE status = 'APPROVED'
      `,
          )
          .all()
          .map((u: any) => ({
            ...u,
            last_seen_at: null,
            device_type: "Desktop",
          }));
      }
    }
    res.json({
      users,
      server_time: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to fetch user status", e);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});
