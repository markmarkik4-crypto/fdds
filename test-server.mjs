import express from "express";
import cors from "cors";
const app = express();
app.use(cors());
app.get("/test", (r, res) => res.json({ ok: 1 }));
app.listen(3000, () => console.log("LISTENING on 3000"));
