package com.pablogeorge.workout_app.service;

import com.pablogeorge.workout_app.model.*;
import com.pablogeorge.workout_app.repository.*;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Service
public class SocialService {

    public record PostDto(
        String authorName,
        String authorPicture,
        String content,
        String imageUrl,
        String timeAgo
    ) {}

    public record PendingRequestDto(
        Long friendshipId,
        String requesterEmail,
        String requesterName,
        String requesterPicture
    ) {}

    private final UserProfileRepository profileRepo;
    private final PostRepository postRepo;
    private final FriendshipRepository friendshipRepo;

    public SocialService(UserProfileRepository profileRepo,
                         PostRepository postRepo,
                         FriendshipRepository friendshipRepo) {
        this.profileRepo = profileRepo;
        this.postRepo = postRepo;
        this.friendshipRepo = friendshipRepo;
    }

    // ── Profiles ──────────────────────────────────────────────────────────────

    public void upsertProfile(String userId, String displayName, String pictureUrl) {
        profileRepo.save(new UserProfile(userId, displayName, pictureUrl));
    }

    // ── Feed ──────────────────────────────────────────────────────────────────

    public void createPost(String authorId, String content, String imageUrl) {
        boolean hasText = content != null && !content.isBlank();
        boolean hasImage = imageUrl != null;
        if (!hasText && !hasImage) return;
        postRepo.save(new Post(authorId, hasText ? content.trim() : null, imageUrl));
    }

    public List<PostDto> getFeed(String userId) {
        List<String> visibleIds = new ArrayList<>(getFriendIds(userId));
        visibleIds.add(userId);

        return postRepo.findTop50ByAuthorIdInOrderByCreatedAtDesc(visibleIds).stream()
            .map(post -> {
                UserProfile p = profileRepo.findById(post.getAuthorId()).orElse(null);
                String name = p != null ? p.getDisplayName() : post.getAuthorId();
                String picture = p != null ? p.getPictureUrl() : null;
                return new PostDto(name, picture, post.getContent(), post.getImageUrl(), timeAgo(post.getCreatedAt()));
            })
            .toList();
    }

    // ── Friends ───────────────────────────────────────────────────────────────

    public String sendFriendRequest(String requesterId, String addresseeEmail) {
        addresseeEmail = addresseeEmail.trim().toLowerCase();
        if (requesterId.equals(addresseeEmail)) return "You can't add yourself.";

        boolean alreadyExists =
            friendshipRepo.existsByRequesterIdAndAddresseeId(requesterId, addresseeEmail) ||
            friendshipRepo.existsByRequesterIdAndAddresseeId(addresseeEmail, requesterId);

        if (alreadyExists) return "Request already sent or you're already friends.";

        friendshipRepo.save(new Friendship(requesterId, addresseeEmail));
        return null; // null = no error
    }

    public void acceptRequest(Long friendshipId, String userId) {
        friendshipRepo.findById(friendshipId).ifPresent(f -> {
            if (f.getAddresseeId().equals(userId) && f.getStatus() == FriendshipStatus.PENDING) {
                f.setStatus(FriendshipStatus.ACCEPTED);
                friendshipRepo.save(f);
            }
        });
    }

    public void rejectRequest(Long friendshipId, String userId) {
        friendshipRepo.findById(friendshipId).ifPresent(f -> {
            if (f.getAddresseeId().equals(userId)) {
                friendshipRepo.delete(f);
            }
        });
    }

    public List<PendingRequestDto> getPendingRequests(String userId) {
        return friendshipRepo.findByAddresseeIdAndStatus(userId, FriendshipStatus.PENDING).stream()
            .map(f -> {
                UserProfile p = profileRepo.findById(f.getRequesterId()).orElse(null);
                String name = p != null ? p.getDisplayName() : f.getRequesterId();
                String picture = p != null ? p.getPictureUrl() : null;
                return new PendingRequestDto(f.getId(), f.getRequesterId(), name, picture);
            })
            .toList();
    }

    public long getFriendCount(String userId) {
        return friendshipRepo.findByRequesterIdAndStatus(userId, FriendshipStatus.ACCEPTED).size()
             + friendshipRepo.findByAddresseeIdAndStatus(userId, FriendshipStatus.ACCEPTED).size();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<String> getFriendIds(String userId) {
        List<String> ids = new ArrayList<>();
        friendshipRepo.findByRequesterIdAndStatus(userId, FriendshipStatus.ACCEPTED)
            .forEach(f -> ids.add(f.getAddresseeId()));
        friendshipRepo.findByAddresseeIdAndStatus(userId, FriendshipStatus.ACCEPTED)
            .forEach(f -> ids.add(f.getRequesterId()));
        return ids;
    }

    private String timeAgo(LocalDateTime dt) {
        long seconds = ChronoUnit.SECONDS.between(dt, LocalDateTime.now());
        if (seconds < 60)  return "just now";
        long mins = seconds / 60;
        if (mins < 60)     return mins + "m ago";
        long hours = mins / 60;
        if (hours < 24)    return hours + "h ago";
        long days = hours / 24;
        if (days < 7)      return days + "d ago";
        return dt.format(DateTimeFormatter.ofPattern("MMM d"));
    }
}
