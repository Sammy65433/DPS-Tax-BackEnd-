import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("hello");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

const PORT = Number(process.env.PORT) || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
