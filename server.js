import express from "express";
const app = express();

app.get("/", (req, res) => {
  res.json({ message: "hello" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
