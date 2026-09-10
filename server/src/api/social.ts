import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { badRequest, forbidden, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { uploadImageField } from "../lib/upload.js";
import { uploadImage } from "../services/imageStorageService.js";
import { getFeed, getFriends, getPendingRequests, getThread, sharePersonalRecord } from "../services/socialService.js";

const router = Router();

const MAX_POST_LENGTH = 280;

router.get(
  "/feed",
  requireAuth,
  handler(async (req, res) => {
    sendData(res, await getFeed(currentUser(req).userId));
  }),
);

router.post(
  "/posts",
  requireAuth,
  uploadImageField,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const content = String(req.body?.content ?? "").trim();
    const file = req.file;

    if (!content && !file) throw badRequest("Write something or attach a photo");
    if (content.length > MAX_POST_LENGTH) throw badRequest("Post is too long");

    // uploadImage throws on a disallowed mime type. The old route left that
    // call outside any try/catch, so it became an unhandled rejection and the
    // request hung until the server (or Lambda) timed out.
    const imageUrl = file ? await uploadImage(file) : null;

    const post = await prisma.post.create({
      data: { authorId: userId, content: content || null, imageUrl },
    });

    sendData(res, { id: post.id, createdAt: post.createdAt }, 201);
  }),
);

router.post(
  "/personal-records/:workoutLogId/share",
  requireAuth,
  handler(async (req, res) => {
    const post = await sharePersonalRecord(
      currentUser(req).userId,
      intParam(req.params.workoutLogId, "workoutLogId"),
    );
    if (!post) throw notFound("Personal record not found");
    sendData(res, { postId: post.id }, 201);
  }),
);

router.get(
  "/posts/:postId",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const postId = intParam(req.params.postId, "postId");

    // getThread enforces visibility. The old route had no check at all, so any
    // signed-in user could read any thread by guessing its id.
    const thread = await getThread(postId, userId);
    if (!thread) throw notFound("Post not found");

    sendData(res, thread);
  }),
);

router.post(
  "/posts/:postId/replies",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const postId = intParam(req.params.postId, "postId");
    const content = String(req.body?.content ?? "").trim();

    if (!content) throw badRequest("Reply cannot be empty");
    if (content.length > MAX_POST_LENGTH) throw badRequest("Reply is too long");

    // Same visibility rule as reading, so a reply can't be used to probe for
    // posts the viewer isn't allowed to see.
    const thread = await getThread(postId, userId);
    if (!thread) throw notFound("Post not found");

    const reply = await prisma.post.create({
      data: { authorId: userId, content, parentId: postId },
    });

    sendData(res, { id: reply.id, createdAt: reply.createdAt }, 201);
  }),
);

router.get(
  "/friends",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const [friends, pendingRequests] = await Promise.all([
      getFriends(userId),
      getPendingRequests(userId),
    ]);
    sendData(res, { friends, pendingRequests });
  }),
);

router.delete(
  "/friends/:friendshipId",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const id = intParam(req.params.friendshipId, "friendshipId");

    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw notFound("Friendship not found");
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      throw forbidden("Not your friendship");
    }

    await prisma.friendship.delete({ where: { id } });
    res.status(204).end();
  }),
);

router.post(
  "/friends/:friendshipId/accept",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const id = intParam(req.params.friendshipId, "friendshipId");

    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw notFound("Request not found");
    if (friendship.addresseeId !== userId) throw forbidden("Not your request");
    if (friendship.status !== "PENDING") throw badRequest("Request is no longer pending");

    await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });
    sendData(res, { friendshipId: id, status: "ACCEPTED" });
  }),
);

router.post(
  "/friends/:friendshipId/reject",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const id = intParam(req.params.friendshipId, "friendshipId");

    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship) throw notFound("Request not found");
    if (friendship.addresseeId !== userId) throw forbidden("Not your request");

    await prisma.friendship.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
