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

router.get("/invite/:token", async (req, res) => {
  const token = req.params.token;
  const inviter = await prisma.userProfile.findUnique({ where: { inviteToken: token } });
  if (!inviter) return res.redirect("/");

  const inviteUrl = `${req.protocol}://${req.get("host")}/invite/${token}`;
  res.render("invite", {
    token,
    inviterName: inviter.displayName ?? inviter.userId,
    inviterPicture: inviter.pictureUrl ?? null,
    inviteUrl,
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
