import express, { Request, Response } from "express";
import cors from "cors";
import { extractJobFromImageBuffer } from "./extract_job_from_image.ts";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
  })
);

app.use(express.json({ limit: "25mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.options("/extract_job_from_image", (_req: Request, res: Response) => {
  res.sendStatus(200);
});

app.post("/extract_job_from_image", async (req: Request, res: Response) => {
  try {
    const imageBase64 =
      typeof req.body?.image_base64 === "string" ? req.body.image_base64 : null;

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        error: "Missing image_base64",
      });
    }

    const cleanedBase64 = imageBase64.replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      ""
    );

    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(cleanedBase64, "base64");
    } catch {
      return res.status(400).json({
        ok: false,
        error: "Invalid base64 image",
      });
    }

    if (!imageBuffer.length) {
      return res.status(400).json({
        ok: false,
        error: "Invalid base64 image",
      });
    }

    const data = await extractJobFromImageBuffer(imageBuffer);

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown extraction error";

    console.error("[extract_job_from_image] error:", message);

    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
});

const port = Number(process.env.PORT || 3001);

app.listen(port, "0.0.0.0", () => {
  console.log(`Sparklog OCR service listening on port ${port}`);
});
