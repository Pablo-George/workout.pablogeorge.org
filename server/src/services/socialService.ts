import crypto from "node:crypto";
import type { UserProfile } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Friend/feed reads shared by the API and the remaining EJS routes.
 *
 * These were previously inline in routes/home.ts and did one profile lookup per
 * friend inside a Promise.all. That is invisible against a local SQLite file but
 * costs a network round trip each once the database is Neon, so every lookup
 * here is batched into a single `in` query.
 */

export type Author = {
  authorId: string;
  authorName: string;
  authorPicture: string | null;
};

export type FeedReply = Author & {
  id: number;
  content: string | null;
  createdAt: Date;
};

export type FeedPost = FeedReply & {
  imageUrl: string | null;
  replies: FeedReply[];
};

async function loadProfiles(ids: Iterable<string>): Promise<Record<string, UserProfile>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const profiles = await prisma.userProfile.findMany({ where: { userId: { in: unique } } });
  return Object.fromEntries(profiles.map((p) => [p.userId, p]));
}

function toAuthor(authorId: string, profiles: Record<string, UserProfile>): Author {
  return {
    authorId,
    authorName: profiles[authorId]?.displayName ?? authorId,
    authorPicture: profiles[authorId]?.pictureUrl ?? null,
  };
}

/** Everyone with an ACCEPTED friendship in either direction. */
export async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
}

export async function getFriends(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { id: true, requesterId: true, addresseeId: true },
  });
  const pairs = rows.map((f) => ({
    friendshipId: f.id,
    friendId: f.requesterId === userId ? f.addresseeId : f.requesterId,
  }));

  const profiles = await loadProfiles(pairs.map((p) => p.friendId));
  return pairs.map(({ friendshipId, friendId }) => ({
    friendshipId,
    userId: friendId,
    name: profiles[friendId]?.displayName ?? friendId,
    pictureUrl: profiles[friendId]?.pictureUrl ?? null,
  }));
}

export async function getPendingRequests(userId: string) {
  const requests = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "PENDING" },
    select: { id: true, requesterId: true },
  });

  const profiles = await loadProfiles(requests.map((r) => r.requesterId));
  return requests.map((f) => ({
    friendshipId: f.id,
    requesterEmail: f.requesterId,
    requesterName: profiles[f.requesterId]?.displayName ?? f.requesterId,
    requesterPicture: profiles[f.requesterId]?.pictureUrl ?? null,
  }));
}

/** Root posts from the user and their friends, newest first, with replies. */
export async function getFeed(userId: string): Promise<FeedPost[]> {
  const friendIds = await getFriendIds(userId);
  const visibleIds = [...friendIds, userId];

  const posts = await prisma.post.findMany({
    where: { authorId: { in: visibleIds }, parentId: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });

  const authorIds = posts.flatMap((p) => [p.authorId, ...p.replies.map((r) => r.authorId)]);
  const profiles = await loadProfiles(authorIds);

  return posts.map((post) => ({
    id: post.id,
    ...toAuthor(post.authorId, profiles),
    content: post.content,
    imageUrl: post.imageUrl,
    createdAt: post.createdAt,
    replies: post.replies.map((r) => ({
      id: r.id,
      ...toAuthor(r.authorId, profiles),
      content: r.content,
      createdAt: r.createdAt,
    })),
  }));
}

/**
 * A single post plus its replies, for the thread view.
 * Returns null when the id is unknown, is a reply, or the viewer isn't allowed
 * to see it — the old GET /social/post/:postId let any signed-in user read any
 * thread by guessing an id.
 */
export async function getThread(postId: number, viewerId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  if (!post || post.parentId !== null) return null;

  const friendIds = await getFriendIds(viewerId);
  if (post.authorId !== viewerId && !friendIds.includes(post.authorId)) return null;

  const profiles = await loadProfiles([post.authorId, ...post.replies.map((r) => r.authorId)]);

  return {
    id: post.id,
    ...toAuthor(post.authorId, profiles),
    content: post.content,
    imageUrl: post.imageUrl,
    createdAt: post.createdAt,
    replies: post.replies.map((r) => ({
      id: r.id,
      ...toAuthor(r.authorId, profiles),
      content: r.content,
      createdAt: r.createdAt,
    })),
  };
}

/**
 * Reuses an already-loaded profile when the caller has one, since the home
 * screen fetches it anyway.
 */
export async function getOrCreateInviteToken(
  userId: string,
  profile?: UserProfile | null,
): Promise<string> {
  const existing =
    profile !== undefined
      ? profile
      : await prisma.userProfile.findUnique({ where: { userId } });
  if (existing?.inviteToken) return existing.inviteToken;

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.userProfile.update({ where: { userId }, data: { inviteToken: token } });
  return token;
}

/** Relative timestamp for the remaining EJS templates. The API sends ISO
 *  timestamps instead and lets the client format them, so they stay live. */
export function timeAgo(dt: Date): string {
  const seconds = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
