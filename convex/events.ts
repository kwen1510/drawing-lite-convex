import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function nextSequence(ctx: Parameters<typeof mutation>[0]["ctx"], channel: string) {
  const latest = await ctx.db
    .query("events")
    .withIndex("by_channel_sequence", (q) => q.eq("channel", channel))
    .order("desc")
    .first();
  return latest ? latest.sequence + 1 : 1;
}

export const publish = mutation({
  args: {
    channel: v.string(),
    event: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const sequence = await nextSequence(ctx, args.channel);
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      channel: args.channel,
      event: args.event,
      payload: args.payload,
      sequence,
      createdAt: now,
    });

    // Lightweight pruning: keep the most recent 400 events per channel.
    const excess = await ctx.db
      .query("events")
      .withIndex("by_channel_sequence", (q) => q.eq("channel", args.channel))
      .order("desc")
      .skip(400)
      .collect();
    await Promise.all(excess.map(({ _id }) => ctx.db.delete(_id)));

    return { eventId, sequence };
  },
});

export const stream = query({
  args: {
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_channel_sequence", (q) => q.eq("channel", args.channel))
      .order("asc")
      .take(400);
    return events;
  },
});
