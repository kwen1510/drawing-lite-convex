import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const strokeValidator = v.object({
  tool: v.union(v.literal("pen"), v.literal("eraser")),
  color: v.string(),
  size: v.number(),
  points: v.array(
    v.object({
      x: v.number(),
      y: v.number(),
    }),
  ),
});

export const append = mutation({
  args: {
    sessionId: v.id("sessions"),
    stroke: strokeValidator,
    authorRole: v.union(v.literal("teacher"), v.literal("student")),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || !session.isActive) {
      throw new ConvexError("Session is not active.");
    }

    await requireParticipant(ctx, args.sessionId, args.authorRole, args.authorName);

    const lastStroke = await ctx.db
      .query("strokes")
      .withIndex("by_session_sequence", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .first();

    const nextSequence = lastStroke ? lastStroke.sequence + 1 : 1;
    const now = Date.now();

    const strokeId = await ctx.db.insert("strokes", {
      sessionId: args.sessionId,
      stroke: args.stroke,
      sequence: nextSequence,
      createdAt: now,
      updatedAt: now,
      authorRole: args.authorRole,
      authorName: args.authorName,
      isDeleted: false,
    });

    return { sequence: nextSequence, strokeId };
  },
});

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const strokes = await ctx.db
      .query("strokes")
      .withIndex("by_session_sequence", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
    return strokes;
  },
});

async function requireParticipant(
  ctx: Parameters<typeof mutation>[0]["ctx"],
  sessionId: string,
  role: "teacher" | "student",
  name: string,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || !session.isActive) {
    throw new ConvexError("Session is not active.");
  }

  const participant = await ctx.db
    .query("participants")
    .withIndex("by_session_role", (q) => q.eq("sessionId", sessionId).eq("role", role))
    .filter((q) => q.eq(q.field("name"), name))
    .first();

  if (!participant) {
    throw new ConvexError("Participant is not registered in this session.");
  }

  return { session, participant };
}

async function findStrokeForAuthor(
  ctx: Parameters<typeof mutation>[0]["ctx"],
  sessionId: string,
  authorRole: "teacher" | "student",
  authorName: string,
  includeDeleted: boolean,
) {
  const query = ctx.db
    .query("strokes")
    .withIndex("by_session_author_sequence", (q) =>
      q.eq("sessionId", sessionId).eq("authorRole", authorRole).eq("authorName", authorName),
    )
    .order("desc");

  if (!includeDeleted) {
    return await query.filter((q) => q.eq(q.field("isDeleted"), false)).first();
  }

  return await query.filter((q) => q.eq(q.field("isDeleted"), true)).first();
}

export const undo = mutation({
  args: {
    sessionId: v.id("sessions"),
    authorRole: v.union(v.literal("teacher"), v.literal("student")),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireParticipant(ctx, args.sessionId, args.authorRole, args.authorName);
    const target = await findStrokeForAuthor(
      ctx,
      args.sessionId,
      args.authorRole,
      args.authorName,
      false,
    );
    if (!target) {
      throw new ConvexError("Nothing to undo.");
    }
    await ctx.db.patch(target._id, { isDeleted: true, updatedAt: Date.now() });
    return { success: true };
  },
});

export const redo = mutation({
  args: {
    sessionId: v.id("sessions"),
    authorRole: v.union(v.literal("teacher"), v.literal("student")),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireParticipant(ctx, args.sessionId, args.authorRole, args.authorName);
    const target = await findStrokeForAuthor(
      ctx,
      args.sessionId,
      args.authorRole,
      args.authorName,
      true,
    );
    if (!target) {
      throw new ConvexError("Nothing to redo.");
    }
    await ctx.db.patch(target._id, { isDeleted: false, updatedAt: Date.now() });
    return { success: true };
  },
});

export const clear = mutation({
  args: {
    sessionId: v.id("sessions"),
    authorRole: v.union(v.literal("teacher"), v.literal("student")),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireParticipant(ctx, args.sessionId, args.authorRole, args.authorName);
    const now = Date.now();
    if (args.authorRole === "teacher") {
      const strokes = await ctx.db
        .query("strokes")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect();
      await Promise.all(
        strokes.map(({ _id, isDeleted }) =>
          isDeleted ? Promise.resolve() : ctx.db.patch(_id, { isDeleted: true, updatedAt: now }),
        ),
      );
      return { success: true, scope: "all" };
    }

    const strokes = await ctx.db
      .query("strokes")
      .withIndex("by_session_author_sequence", (q) =>
        q.eq("sessionId", args.sessionId).eq("authorRole", args.authorRole).eq("authorName", args.authorName),
      )
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .collect();

    if (!strokes.length) {
      throw new ConvexError("Nothing to clear.");
    }

    await Promise.all(
      strokes.map(({ _id }) => ctx.db.patch(_id, { isDeleted: true, updatedAt: now })),
    );
    return { success: true, scope: "self" };
  },
});
