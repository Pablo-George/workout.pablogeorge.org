package com.pablogeorge.workout_app.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "friendships",
       uniqueConstraints = @UniqueConstraint(columnNames = {"requester_id", "addressee_id"}))
@Getter @Setter @NoArgsConstructor
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "requester_id", nullable = false)
    private String requesterId;

    @Column(name = "addressee_id", nullable = false)
    private String addresseeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FriendshipStatus status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    public Friendship(String requesterId, String addresseeId) {
        this.requesterId = requesterId;
        this.addresseeId = addresseeId;
        this.status = FriendshipStatus.PENDING;
        this.createdAt = LocalDateTime.now();
    }
}
