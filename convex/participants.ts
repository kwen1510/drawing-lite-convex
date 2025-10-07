import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
    const now = Date.now();
    return participants.map((participant) => ({
      ...participant,
      status: now - participant.updatedAt > 45_000 ? "offline" : participant.status,
    }));
  },
});

export const markOffline = mutation({
  args: { participantId: v.id("participants") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.participantId, {
      status: "offline",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
