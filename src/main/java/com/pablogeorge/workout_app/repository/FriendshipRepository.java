package com.pablogeorge.workout_app.repository;

import com.pablogeorge.workout_app.model.Friendship;
import com.pablogeorge.workout_app.model.FriendshipStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {
    List<Friendship> findByRequesterIdAndStatus(String requesterId, FriendshipStatus status);
    List<Friendship> findByAddresseeIdAndStatus(String addresseeId, FriendshipStatus status);
    boolean existsByRequesterIdAndAddresseeId(String requesterId, String addresseeId);
    Optional<Friendship> findByRequesterIdAndAddresseeId(String requesterId, String addresseeId);
}
