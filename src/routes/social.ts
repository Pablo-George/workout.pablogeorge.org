import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { uploadImage } from "../services/imageStorageService.js";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/social/post", ensureAuth, upload.single("image"), async (req, res) => {
  const user = req.user as any;
  const content = (req.body.content as string)?.trim() || null;
  const file = req.file;

  const hasText = content !== null && content.length > 0;
  const hasImage = file !== undefined;

  if (!hasText && !hasImage) return res.redirect("/#tab-social");

  let imageUrl: string | null = null;
  if (file) {
    imageUrl = await uploadImage(file);
  }

  await prisma.post.create({
    data: {
      authorId: user.userId,
      content: hasText ? content : null,
      imageUrl,
    },
  });

  res.redirect("/#tab-social");
});

router.get("/og/invite", (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0f0f0f"/>
    <rect x="0" y="0" width="1200" height="630" fill="url(#grad)" opacity="0.3"/>
    <defs>
      <radialGradient id="grad" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#4f9eff" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#0f0f0f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <text x="600" y="290" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="140">🏋️</text>
    <text x="600" y="420" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="52" font-weight="bold" fill="#ffffff">Workout Tracker</text>
    <text x="600" y="490" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="30" fill="#666666">Add me as a friend and track our gains together</text>
  </svg>`;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(svg);
});

router.get("/invite/:token", async (req, res) => {
  const token = req.params.token;
  const inviter = await prisma.userProfile.findUnique({ where: { inviteToken: token } });
  if (!inviter) return res.redirect("/");

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const inviteUrl = `${baseUrl}/invite/${token}`;
  res.render("invite", {
    token,
    inviterName: inviter.displayName ?? inviter.userId,
    inviterPicture: inviter.pictureUrl ?? null,
    inviteUrl,
    baseUrl,
  });
});

router.get("/invite/:token/accept", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const token = req.params.token;

  const inviter = await prisma.userProfile.findUnique({ where: { inviteToken: token } });
  if (!inviter || inviter.userId === user.userId) return res.redirect("/#tab-social");

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.userId, addresseeId: inviter.userId },
        { requesterId: inviter.userId, addresseeId: user.userId },
      ],
    },
  });

  if (!existing) {
    await prisma.friendship.create({
      data: { requesterId: inviter.userId, addresseeId: user.userId, status: "ACCEPTED" },
    });
  } else if (existing.status === "PENDING") {
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "ACCEPTED" } });
  }

  res.redirect("/#tab-social");
});

router.post("/social/friends/remove/:id", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.params.id);

  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (friendship && (friendship.requesterId === user.userId || friendship.addresseeId === user.userId)) {
    await prisma.friendship.delete({ where: { id } });
  }

  res.redirect("/#social-friends");
});

router.post("/social/friends/accept/:id", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.params.id);

  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (friendship && friendship.addresseeId === user.userId && friendship.status === "PENDING") {
    await prisma.friendship.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });
  }

  res.redirect("/#social-friends");
});

router.post("/social/friends/reject/:id", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.params.id);

  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (friendship && friendship.addresseeId === user.userId) {
    await prisma.friendship.delete({ where: { id } });
  }

  res.redirect("/#social-friends");
});

export default router;
