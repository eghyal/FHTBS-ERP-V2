import { Router } from "express";
import db from "../db/database.ts";

export const forumRouter = Router();

// Forum API
forumRouter.get("/api/forum/posts", (req, res) => {
  try {
    const posts = db
      .prepare(
        `
    SELECT p.*, COUNT(c.id) as comment_count 
    FROM forum_posts p
    LEFT JOIN forum_comments c ON p.id = c.post_id
    GROUP BY p.id
    ORDER BY 
      CASE WHEN p.pinned_until > datetime('now') THEN 0 ELSE 1 END,
      p.created_at DESC
  `,
      )
      .all();
    res.json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

forumRouter.post("/api/forum/posts", (req, res) => {
  try {
    const {
      title,
      content,
      author_username,
      author_role,
      category,
      pinned_until,
      shared_resource_type,
      shared_resource_id,
    } = req.body;
    const id = "POST-" + Math.random().toString(36).substr(2, 9);
    db.prepare(
      `
    INSERT INTO forum_posts (id, title, content, author_username, author_role, category, pinned_until, shared_resource_type, shared_resource_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      title,
      content,
      author_username,
      author_role,
      category,
      pinned_until || null,
      shared_resource_type || null,
      shared_resource_id || null,
    );
    res.json({ success: true, id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

forumRouter.post("/api/forum/share", (req, res) => {
  try {
    const { type, id, title, content, author_username, author_role } = req.body;
    const postId = "POST-" + Math.random().toString(36).substr(2, 9);
    db.prepare(
      `
    INSERT INTO forum_posts (id, title, content, author_username, author_role, category, shared_resource_type, shared_resource_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      postId,
      title,
      content,
      author_username,
      author_role,
      "SHARED_RESOURCE",
      type,
      id,
    );
    res.json({ success: true, id: postId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to share resource" });
  }
});

forumRouter.get("/api/forum/posts/:id/comments", (req, res) => {
  try {
    const comments = db
      .prepare(
        "SELECT * FROM forum_comments WHERE post_id = ? ORDER BY created_at ASC",
      )
      .all(req.params.id);
    res.json(comments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

forumRouter.post("/api/forum/posts/:id/comments", (req, res) => {
  try {
    const { content, author_username, author_role } = req.body;
    const id = "COM-" + Math.random().toString(36).substr(2, 9);
    db.prepare(
      "INSERT INTO forum_comments (id, post_id, content, author_username, author_role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, req.params.id, content, author_username, author_role);
    res.json({ success: true, id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create comment" });
  }
});
