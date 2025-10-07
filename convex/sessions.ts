import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const CODE_LENGTH = 4;

function generateCode() {
  return Math.random().toString().slice(2, 2 + CODE_LENGTH);
}

async function allocateCode(ctx: Parameters<typeof mutation>[0]["ctx"]) {
  let attempts = 0;
  while (attempts < 25) {
    attempts += 1;
    const code = generateCode();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!existing) {
      return code;
    }
  }
  throw new ConvexError("Could not allocate session code, try again.");
}

export const create = mutation({
  args: { teacherName: v.string() },
  handler: async (ctx, args) => {
    const code = await allocateCode(ctx);
    const createdAt = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      code,
      teacherName: args.teacherName,
      createdAt,
      isActive: true,
    });
    await ctx.db.insert("participants", {
      sessionId,
      name: args.teacherName,
      role: "teacher",
      status: "online",
      updatedAt: createdAt,
    });
    return { sessionId, code };
  },
});

export const end = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new ConvexError("Session not found.");
    }
    await ctx.db.patch(args.sessionId, { isActive: false });
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_session_role", (q) => q.eq("sessionId", args.sessionId).eq("role", "student"))
      .collect();
    await Promise.all(
      participants.map(({ _id }) =>
        ctx.db.patch(_id, { status: "offline", updatedAt: Date.now() }),
      ),
    );
    return { success: true };
  },
});

export const lookupByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session) {
      throw new ConvexError("Session not found.");
    }
    if (!session.isActive) {
      throw new ConvexError("Session is no longer active.");
    }
    return session;
  },
});

export const heartbeat = mutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
    role: v.union(v.literal("teacher"), v.literal("student")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_session_role", (q) =>
        q.eq("sessionId", args.sessionId).eq("role", args.role),
      )
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    if (!participant) {
      await ctx.db.insert("participants", {
        sessionId: args.sessionId,
        name: args.name,
        role: args.role,
        status: "online",
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(participant._id, { status: "online", updatedAt: now });
    }
    return { success: true };
  },
});
