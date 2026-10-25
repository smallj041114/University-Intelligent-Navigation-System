const express = require("express");
const dotenv = require("dotenv");
const { query } = require("./db");

dotenv.config();

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1 AS ok");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/nodes", async (req, res) => {
  try {
    const { node_type, building_code, floor_label } = req.query;
    const conditions = ["is_active = 1"];
    const params = [];

    if (node_type) {
      conditions.push("node_type = ?");
      params.push(node_type);
    }
    if (building_code) {
      conditions.push("building_code = ?");
      params.push(building_code);
    }
    if (floor_label) {
      conditions.push("floor_label = ?");
      params.push(floor_label);
    }

    const rows = await query(
      `SELECT id, code, name, node_type, lat, lng, building_code, floor_label
       FROM nodes
       WHERE ${conditions.join(" AND ")}
       ORDER BY id ASC`,
      params
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch nodes", error: error.message });
  }
});

app.get("/api/nodes/:id/panoramas", async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, node_id, title, pano_url, thumbnail_url, yaw_deg, pitch_deg, hfov_deg, is_primary
       FROM panoramas
       WHERE node_id = ?
       ORDER BY is_primary DESC, id ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch panoramas", error: error.message });
  }
});

app.get("/api/edges", async (req, res) => {
  try {
    const { from_node_id } = req.query;
    const conditions = ["is_active = 1"];
    const params = [];

    if (from_node_id) {
      conditions.push("(from_node_id = ? OR (to_node_id = ? AND bidirectional = 1))");
      params.push(from_node_id, from_node_id);
    }

    const rows = await query(
      `SELECT id, from_node_id, to_node_id, distance_m, estimated_seconds, move_type, bidirectional
       FROM edges
       WHERE ${conditions.join(" AND ")}
       ORDER BY id ASC`,
      params
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch edges", error: error.message });
  }
});

app.get("/api/routes/simple", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "Query params 'from' and 'to' are required." });
    }

    const nodes = await query(
      `SELECT id, code, name, lat, lng, node_type, building_code, floor_label
       FROM nodes
       WHERE code IN (?, ?) AND is_active = 1`,
      [from, to]
    );

    if (nodes.length !== 2) {
      return res.status(404).json({ message: "From/To node not found." });
    }

    const fromNode = nodes.find((n) => n.code === from);
    const toNode = nodes.find((n) => n.code === to);

    const directEdge = await query(
      `SELECT id, from_node_id, to_node_id, distance_m, estimated_seconds, move_type, bidirectional
       FROM edges
       WHERE is_active = 1
         AND (
           (from_node_id = ? AND to_node_id = ?)
           OR
           (from_node_id = ? AND to_node_id = ? AND bidirectional = 1)
         )
       LIMIT 1`,
      [fromNode.id, toNode.id, toNode.id, fromNode.id]
    );

    if (directEdge.length === 0) {
      return res.status(404).json({
        message: "No direct edge found in Phase 2 simple route API."
      });
    }

    return res.json({
      route_type: "direct",
      from: fromNode,
      to: toNode,
      edge: directEdge[0],
      path_nodes: [fromNode, toNode]
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to build route", error: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`MCU navigation API running on http://localhost:${port}`);
});
