import { Router } from "express";
import db from "../db/database.ts";
import crypto from "crypto";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";

export const chatRouter = Router();

chatRouter.get("/api/chat/unread", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });
    const row = db
      .prepare(
        `
    SELECT COUNT(*) as unread_count
    FROM chat_messages m
    JOIN chat_participants p ON m.thread_id = p.thread_id
    WHERE p.username = ? AND m.sender_username != ? AND (m.read_by NOT LIKE '%' || ? || '%' OR m.read_by IS NULL)
  `,
      )
      .get(username, username, username) as { unread_count: number } | undefined;

    const unreadCount = row?.unread_count || 0;

    const latestMsg = db
      .prepare(
        `
    SELECT m.id, m.thread_id, m.sender_username, m.content, m.created_at
    FROM chat_messages m
    JOIN chat_participants p ON m.thread_id = p.thread_id
    WHERE p.username = ? AND m.sender_username != ? AND (m.read_by NOT LIKE '%' || ? || '%' OR m.read_by IS NULL)
    ORDER BY m.created_at DESC
    LIMIT 1
  `,
      )
      .get(username, username, username) as any;

    res.json({
      success: true,
      count: unreadCount,
      unread_count: unreadCount,
      latest_message: latestMsg || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

chatRouter.get("/api/chat/threads", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const threads = db
      .prepare(
        `
       SELECT t.*, 
       (SELECT COUNT(*) FROM chat_participants cp2 WHERE cp2.thread_id = t.id) as participant_count,
       (SELECT content FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
       (SELECT created_at FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
       (SELECT sender_username FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_sender
       FROM chat_threads t
       JOIN chat_participants p ON t.id = p.thread_id
       WHERE p.username = ?
       ORDER BY (SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id = t.id) DESC
     `,
      )
      .all(username) as any[];

    for (let t of threads) {
      t.participants = db
        .prepare("SELECT username FROM chat_participants WHERE thread_id = ?")
        .all(t.id)
        .map((x: any) => x.username);
    }

    res.json(threads);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

chatRouter.post("/api/chat/threads", (req, res) => {
  try {
    const { name, is_group, participants } = req.body;
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    if (!participants.includes(username)) {
      participants.push(username);
    }

    if (!is_group && participants.length === 2) {
      const existing = db
        .prepare(
          `
       SELECT t.id FROM chat_threads t
       JOIN chat_participants p1 ON t.id = p1.thread_id AND p1.username = ?
       JOIN chat_participants p2 ON t.id = p2.thread_id AND p2.username = ?
       WHERE t.is_group = 0
     `,
        )
        .get(participants[0], participants[1]) as any;

      if (existing) {
        return res.json({ success: true, id: existing.id });
      }
    }

    const id = "THR-" + crypto.randomUUID();

    db.transaction(() => {
      db.prepare(
        "INSERT INTO chat_threads (id, name, is_group, created_by) VALUES (?, ?, ?, ?)",
      ).run(id, name || null, is_group ? 1 : 0, username);

      for (let p of participants) {
        db.prepare(
          "INSERT INTO chat_participants (thread_id, username) VALUES (?, ?)",
        ).run(id, p);
      }
    })();

    syncCollectionToFirestore("chat_threads", id, {
      id,
      name: name || null,
      is_group: is_group ? 1 : 0,
      created_by: username,
      created_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

chatRouter.post("/api/chat/threads/:id/participants", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const { users } = req.body;

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(req.params.id) as any;

    if (!thread || !thread.is_group)
      return res
        .status(400)
        .json({ error: "Invalid thread or not a group" });

    db.transaction(() => {
      for (let u of users) {
        db.prepare(
          "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES (?, ?)",
        ).run(req.params.id, u);
      }
    })();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to add participants" });
  }
});

chatRouter.delete("/api/chat/threads/:id/participants/:username", (req, res) => {
  try {
    const currentUser = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!currentUser)
      return res.status(401).json({ error: "Unauthorized" });

    const threadId = req.params.id;
    const targetUser = req.params.username;

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(threadId) as any;

    if (!thread || !thread.is_group)
      return res
        .status(400)
        .json({ error: "Invalid thread or not a group" });

    db.prepare(
      "DELETE FROM chat_participants WHERE thread_id = ? AND username = ?",
    ).run(threadId, targetUser);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to remove participant" });
  }
});

chatRouter.delete("/api/chat/threads/:id", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });
    const threadId = req.params.id;
    db.prepare("DELETE FROM chat_messages WHERE thread_id = ?").run(
      threadId,
    );
    db.prepare("DELETE FROM chat_participants WHERE thread_id = ?").run(
      threadId,
    );
    db.prepare("DELETE FROM chat_threads WHERE id = ?").run(threadId);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

chatRouter.get("/api/chat/threads/:id/messages", (req, res) => {
  try {
    const messages = db
      .prepare(
        "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC",
      )
      .all(req.params.id);
    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

chatRouter.post("/api/chat/threads/:id/read", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const messages = db
      .prepare(
        "SELECT id, read_by FROM chat_messages WHERE thread_id = ? AND sender_username != ? AND read_by NOT LIKE '%' || ? || '%'",
      )
      .all(req.params.id, username, username) as any[];

    const updateStmt = db.prepare(
      "UPDATE chat_messages SET read_by = ? WHERE id = ?",
    );

    db.transaction(() => {
      for (const msg of messages) {
        let currentArr = [];
        try {
          currentArr = JSON.parse(msg.read_by || "[]");
        } catch (e) {}
        if (!currentArr.includes(username)) {
          currentArr.push(username);
          updateStmt.run(JSON.stringify(currentArr), msg.id);
        }
      }
    })();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read messages" });
  }
});

chatRouter.post("/api/chat/threads/:id/messages", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const { content, file_url, file_name, file_size, file_type } = req.body;
    const id = "MSG-" + crypto.randomUUID();

    db.prepare(
      `
     INSERT INTO chat_messages (id, thread_id, sender_username, content, file_url, file_name, file_size, file_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   `,
    ).run(
      id,
      req.params.id,
      username,
      content || null,
      file_url || null,
      file_name || null,
      file_size || null,
      file_type || null,
    );

    syncCollectionToFirestore("chat_messages", id, {
      id,
      thread_id: req.params.id,
      sender_username: username,
      content: content || null,
      file_url: file_url || null,
      file_name: file_name || null,
      file_size: file_size || null,
      file_type: file_type || null,
      created_at: new Date().toISOString()
    });

    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

chatRouter.delete("/api/chat/messages/:id", (req, res) => {
  try {
    const username = (req.headers["x-user-email"] ||
      req.headers["remote-user"] ||
      req.headers["x-forwarded-user"]) as string;
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const msg = db
      .prepare("SELECT sender_username FROM chat_messages WHERE id = ?")
      .get(req.params.id) as any;

    if (!msg || msg.sender_username !== username)
      return res.status(403).json({ error: "Forbidden" });

    db.prepare(
      "UPDATE chat_messages SET is_deleted = 1, content = 'This message was deleted', file_url = NULL, file_name = NULL, file_size = NULL, file_type = NULL WHERE id = ?",
    ).run(req.params.id);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});
