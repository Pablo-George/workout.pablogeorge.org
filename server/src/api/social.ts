import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { uploadImage, deleteImage } from "../services/imageStorageService.js";

const router = Router();
router.use(apiAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function timeAgo(dt: Date): string {
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function friendIds(userId: string): Promise<string[]> {
  const [sent, received] = await Promise.all([
    prisma.friendship.findMany({ where: { requesterId: userId, status: "ACCEPTED" } }),
    prisma.friendship.findMany({ where: { addresseeId: userId, status: "ACCEPTED" } }),
  ]);
  return [...sent.map((f) => f.addresseeId), ...received.map((f) => f.requesterId)];
}

router.get(
  "/feed",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const visibleIds = [...(await friendIds(userId)), userId];
    const posts = await prisma.post.findMany({
      where: { authorId: { in: visibleIds }, parentId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });

    const authorIds = new Set<string>();
    for (const p of posts) {
      authorIds.add(p.authorId);
      for (const r of p.replies) authorIds.add(r.authorId);
    }
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: [...authorIds] } } });
    const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

    sendData(
      res,
      posts.map((post) => ({
        id: post.id,
        authorId: post.authorId,
        authorName: profileMap[post.authorId]?.displayName ?? post.authorId,
        authorPicture: profileMap[post.authorId]?.pictureUrl ?? null,
        content: post.content,
        imageUrl: post.imageUrl,
        kind: post.kind,
        prLiftName: post.prLiftName,
        prWeight: post.prWeight,
        prReps: post.prReps,
        createdAt: post.createdAt,
        timeAgo: timeAgo(post.createdAt),
        replies: post.replies.map((r) => ({
          id: r.id,
          authorId: r.authorId,
          authorName: profileMap[r.authorId]?.displayName ?? r.authorId,
          authorPicture: profileMap[r.authorId]?.pictureUrl ?? null,
          content: r.content,
          timeAgo: timeAgo(r.createdAt),
        })),
      }))
    );
  })
);

router.post(
  "/posts",
  upload.single("image"),
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const content = String(req.body?.content ?? "").trim() || null;
    const file = req.file;
    if (!content && !file) throw badRequest("Post needs text or an image");

    const imageUrl = file ? await uploadImage(file) : null;
    const post = await prisma.post.create({ data: { authorId: userId, content, imageUrl } });
    sendData(res, { id: post.id }, 201);
  })
);

router.delete(
  "/posts/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const postId = intParam(req.params.id);
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.authorId !== userId || post.parentId !== null) throw notFound("Post not found");
    await prisma.$transaction([
      prisma.post.deleteMany({ where: { parentId: postId } }),
      prisma.post.delete({ where: { id: postId } }),
    ]);
    await deleteImage(post.imageUrl);
    sendData(res, { ok: true });
  })
);

router.post(
  "/posts/:id/replies",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const postId = intParam(req.params.id);
    const content = String(req.body?.content ?? "").trim();
    if (!content) throw badRequest("Reply can't be empty");
    const parent = await prisma.post.findUnique({ where: { id: postId } });
    if (!parent || parent.parentId !== null) throw notFound("Post not found");
    const reply = await prisma.post.create({ data: { authorId: userId, content, parentId: postId } });
    sendData(res, { id: reply.id }, 201);
  })
);

router.get(
  "/friends",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const [sent, received, pending] = await Promise.all([
      prisma.friendship.findMany({ where: { requesterId: userId, status: "ACCEPTED" } }),
      prisma.friendship.findMany({ where: { addresseeId: userId, status: "ACCEPTED" } }),
      prisma.friendship.findMany({ where: { addresseeId: userId, status: "PENDING" } }),
    ]);
    const all = [
      ...sent.map((f) => ({ friendshipId: f.id, friendId: f.addresseeId })),
      ...received.map((f) => ({ friendshipId: f.id, friendId: f.requesterId })),
    ];
    const ids = [...all.map((a) => a.friendId), ...pending.map((p) => p.requesterId)];
    const profiles = await prisma.userProfile.findMany({ where: { userId: { in: ids } } });
    const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

    sendData(res, {
      friends: all.map(({ friendshipId, friendId }) => ({
        friendshipId,
        userId: friendId,
        name: profileMap[friendId]?.displayName ?? friendId,
        pictureUrl: profileMap[friendId]?.pictureUrl ?? null,
      })),
      pendingRequests: pending.map((f) => ({
        friendshipId: f.id,
        requesterEmail: f.requesterId,
        requesterName: profileMap[f.requesterId]?.displayName ?? f.requesterId,
        requesterPicture: profileMap[f.requesterId]?.pictureUrl ?? null,
      })),
    });
  })
);

router.post(
  "/friends/:id/accept",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship || friendship.addresseeId !== userId || friendship.status !== "PENDING") throw notFound("Request not found");
    await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });
    sendData(res, { ok: true });
  })
);

router.post(
  "/friends/:id/reject",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship || friendship.addresseeId !== userId) throw notFound("Request not found");
    await prisma.friendship.delete({ where: { id } });
    sendData(res, { ok: true });
  })
);

router.delete(
  "/friends/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship || (friendship.requesterId !== userId && friendship.addresseeId !== userId)) throw notFound("Friendship not found");
    await prisma.friendship.delete({ where: { id } });
    sendData(res, { ok: true });
  })
);

// Friend requests are only created via a shared invite link today (see
// /invite/:token/accept in routes/social.ts) — there's no "add by email"
// flow yet, on web or native.
router.get(
  "/invite-link",
  handler(async (req, res) => {
    const user = currentUser(req);
    let inviteToken = user.inviteToken;
    if (!inviteToken) {
      const crypto = await import("node:crypto");
      inviteToken = crypto.randomBytes(16).toString("hex");
      await prisma.userProfile.update({ where: { userId: user.userId }, data: { inviteToken } });
    }
    sendData(res, { inviteToken });
  })
);

export default router;
