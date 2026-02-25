import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const db = new Database("itineraries.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS itineraries (
    id TEXT PRIMARY KEY,
    title TEXT,
    destination TEXT,
    duration INTEGER,
    budget TEXT,
    type TEXT,
    interests TEXT,
    activities TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/itineraries", (req, res) => {
    const { title, destination, duration, budget, type, interests, activities, content } = req.body;
    const id = uuidv4();
    
    const stmt = db.prepare(`
      INSERT INTO itineraries (id, title, destination, duration, budget, type, interests, activities, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, title || `Viaggio a ${destination}`, destination, duration, budget, type, JSON.stringify(interests), JSON.stringify(activities), content);
    
    res.json({ id });
  });

  app.get("/api/itineraries", (req, res) => {
    const rows = db.prepare("SELECT * FROM itineraries ORDER BY created_at DESC").all();
    res.json(rows.map(row => ({
      ...row,
      interests: JSON.parse(row.interests as string),
      activities: JSON.parse(row.activities as string)
    })));
  });

  app.get("/api/itineraries/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM itineraries WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    
    res.json({
      ...row,
      interests: JSON.parse(row.interests as string),
      activities: JSON.parse(row.activities as string)
    });
  });

  app.patch("/api/itineraries/:id", (req, res) => {
    const { title } = req.body;
    db.prepare("UPDATE itineraries SET title = ? WHERE id = ?").run(title, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/itineraries/:id", (req, res) => {
    db.prepare("DELETE FROM itineraries WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
