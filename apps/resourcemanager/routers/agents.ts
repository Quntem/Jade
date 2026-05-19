import express from "express";
import { enrollAgent, EnrollmentError } from "../functions/agentEnrollment";

const router = express.Router();

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function optionalJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

router.post("/enroll", async (req, res) => {
  const token = optionalString(req.body.token);

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    const enrollment = await enrollAgent({
      token,
      serverId: optionalString(req.body.serverId),
      name: optionalString(req.body.name),
      hostname: optionalString(req.body.hostname),
      os: optionalString(req.body.os),
      arch: optionalString(req.body.arch),
      agentName: optionalString(req.body.agentName),
      agentVersion: optionalString(req.body.agentVersion),
      labels: optionalJsonObject(req.body.labels),
      annotations: optionalJsonObject(req.body.annotations),
      metadata: optionalJsonObject(req.body.metadata),
      capabilities: optionalJsonObject(req.body.capabilities),
    });

    res.status(201).json(enrollment);
  } catch (error) {
    if (error instanceof EnrollmentError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    throw error;
  }
});

export default router;
