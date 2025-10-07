import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    code: v.string(),
    teacherName: v.string(),
    createdAt: v.number(),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),
  strokes: defineTable({
    sessionId: v.id("sessions"),
    authorRole: v.union(v.literal("teacher"), v.literal("student")),
    authorName: v.string(),
    stroke: v.object({
      tool: v.string(),
      color: v.string(),
      size: v.number(),
      points: v.array(
        v.object({
          x: v.number(),
          y: v.number(),
        }),
      ),
    }),
    sequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    isDeleted: v.boolean(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_sequence", ["sessionId", "sequence"])
    .index("by_session_author_sequence", ["sessionId", "authorRole", "authorName", "sequence"]),
  participants: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(),
    role: v.union(v.literal("teacher"), v.literal("student")),
    status: v.union(v.literal("online"), v.literal("offline")),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_role", ["sessionId", "role"]),
});
